const printQueue = require('../config/queue');
const AttendeeModel = require('../models/attendee');

class PrinterService {
  // Submit print request to queue
  static async submitPrintJob(attendeeId, attendeeName) {
    const job = await printQueue.add(
      'print_badge',
      {
        attendeeId,
        attendeeName,
        timestamp: new Date().toISOString()
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000
        }
      }
    );

    await AttendeeModel.updateStatus(
      attendeeId, 
      'printing', 
      job.id
    );

    return job.id;
  }

  // Simulate print job processing
  static async processPrintJob(job) {
    const { attendeeId, attendeeName } = job.data;
    console.log(`🖨️ Processing print job for ${attendeeName} (${attendeeId})`);

    // Simulate variable processing time (1-5 seconds)
    const processingTime = Math.floor(Math.random() * 4000) + 1000;
    await new Promise(resolve => setTimeout(resolve, processingTime));

    // Simulate occasional failure (10% chance)
    if (Math.random() < 0.1) {
      throw new Error(`Print failed for ${attendeeId}`);
    }

    return {
      success: true,
      printId: `PRINT-${Date.now()}-${attendeeId}`,
      completedAt: new Date().toISOString()
    };
  }
}

module.exports = PrinterService;
