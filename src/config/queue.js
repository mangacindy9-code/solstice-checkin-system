const Queue = require('bull');
const redis = require('./redis');

// Initialize print queue
const printQueue = new Queue('print jobs', {
  redis: {
    host: 'localhost',
    port: 6379
  },
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000
    }
  }
});

module.exports = printQueue;
