const express = require('express');
const cors = require('cors');
const AttendeeModel = require('./models/attendee');
const PrinterService = require('./services/printerService');
const printQueue = require('./config/queue');
const redis = require('./config/redis');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Test data
const TEST_ATTENDEES = {
  'A1001': { name: 'Alice Johnson' },
  'A1002': { name: 'Bob Smith' },
  'A1003': { name: 'Carol Davis' }
};

// Initialize test attendees
async function initializeTestData() {
  for (const [id, data] of Object.entries(TEST_ATTENDEES)) {
    const key = `attendee:${id}`;
    const exists = await redis.exists(key);
    if (!exists) {
      await redis.hset(key, {
        id: id,
        name: data.name,
        status: 'pending'
      });
    }
  }
  console.log('✅ Test attendees initialized');
}

// Endpoint: Check-in attendee
app.post('/api/checkin', async (req, res) => {
  const { attendeeId } = req.body;

  if (!attendeeId || !TEST_ATTENDEES[attendeeId]) {
    return res.status(400).json({
      success: false,
      error: 'Invalid attendee ID'
    });
  }

  try {
    const result = await AttendeeModel.tryCheckIn(
      attendeeId, 
      TEST_ATTENDEES[attendeeId]
    );

    if (result.isDuplicate) {
      const status = await AttendeeModel.getStatus(attendeeId);
      if (status.status === 'checked_in') {
        return res.status(409).json({
          success: false,
          error: 'Already checked in',
          attendee: status
        });
      } else {
        return res.status(409).json({
          success: false,
          error: 'Already in progress',
          attendee: status
        });
      }
    }

    const printJobId = await PrinterService.submitPrintJob(
      attendeeId,
      TEST_ATTENDEES[attendeeId].name
    );

    res.json({
      success: true,
      status: 'pending',
      message: 'Print job submitted, waiting for confirmation',
      attendeeId,
      printJobId
    });

  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Endpoint: Webhook for print completion
app.post('/api/webhook/print-complete', async (req, res) => {
  const { 
    printJobId, 
    attendeeId, 
    status = 'completed',
    error 
  } = req.body;

  console.log(`📨 Webhook received for ${attendeeId}, status: ${status}`);

  try {
    const currentStatus = await AttendeeModel.getStatus(attendeeId);
    
    if (!currentStatus) {
      return res.status(404).json({
        success: false,
        error: 'Attendee not found'
      });
    }

    if (currentStatus.status === 'checked_in') {
      console.log(`⚠️ ${attendeeId} already checked in, ignoring webhook`);
      return res.status(200).json({
        success: true,
        message: 'Already processed'
      });
    }

    if (currentStatus.printJobId !== printJobId) {
      console.log(`⚠️ Job ID mismatch for ${attendeeId}`);
      const newerJob = await redis.hget(
        `attendee:${attendeeId}`, 
        'printJobId'
      );
      
      if (newerJob && newerJob !== printJobId) {
        return res.status(200).json({
          success: false,
          message: 'Outdated webhook ignored',
          currentJobId: newerJob
        });
      }
    }

    if (status === 'completed') {
      await AttendeeModel.updateStatus(
        attendeeId,
        'checked_in',
        printJobId
      );
      
      console.log(`✅ ${attendeeId} checked in successfully`);
    } else {
      await AttendeeModel.updateStatus(
        attendeeId,
        'pending',
        printJobId
      );
      
      console.log(`❌ Print failed for ${attendeeId}, status reset`);
    }

    res.json({
      success: true,
      message: 'Webhook processed successfully',
      attendee: await AttendeeModel.getStatus(attendeeId)
    });

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({
      success: false,
      error: 'Webhook processing failed'
    });
  }
});

// Endpoint: Get attendee status
app.get('/api/attendee/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const attendee = await AttendeeModel.getStatus(id);
    if (!attendee) {
      return res.status(404).json({
        success: false,
        error: 'Attendee not found'
      });
    }
    
    res.json({
      success: true,
      attendee
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch attendee status'
    });
  }
});

// Queue worker to process print jobs
printQueue.process('print_badge', async (job) => {
  const { attendeeId, attendeeName } = job.data;
  console.log(`🎯 Processing job ${job.id} for ${attendeeName}`);
  
  try {
    const result = await PrinterService.processPrintJob(job);
    
    const webhookData = {
      printJobId: job.id,
      attendeeId,
      status: 'completed',
      ...result
    };
    
    setTimeout(async () => {
      try {
        const response = await fetch(
          `http://localhost:${PORT}/api/webhook/print-complete`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(webhookData)
          }
        );
        console.log(`📤 Webhook sent for ${attendeeId}, status: ${response.status}`);
      } catch (error) {
        console.error('Webhook delivery failed:', error);
      }
    }, 100);
    
    return result;
    
  } catch (error) {
    console.error(`❌ Print failed for ${attendeeName}:`, error);
    
    const webhookData = {
      printJobId: job.id,
      attendeeId,
      status: 'failed',
      error: error.message
    };
    
    setTimeout(async () => {
      try {
        await fetch(
          `http://localhost:${PORT}/api/webhook/print-complete`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(webhookData)
          }
        );
      } catch (webhookError) {
        console.error('Failure webhook delivery failed:', webhookError);
      }
    }, 100);
    
    throw error;
  }
});

// Start server
async function startServer() {
  await initializeTestData();
  
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log('📋 Test attendees:', Object.keys(TEST_ATTENDEES));
    console.log('🔄 Pending status will be shown until webhook confirms check-in');
  });
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await printQueue.close();
  await redis.quit();
  process.exit(0);
});

startServer().catch(console.error);
