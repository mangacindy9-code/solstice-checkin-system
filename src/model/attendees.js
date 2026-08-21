const redis = require('../config/redis');

class AttendeeModel {
  // Check if attendee exists and get their status
  static async getStatus(attendeeId) {
    const key = `attendee:${attendeeId}`;
    const data = await redis.hgetall(key);
    if (!data || Object.keys(data).length === 0) return null;
    return {
      id: attendeeId,
      name: data.name,
      status: data.status || 'pending',
      checkedInAt: data.checkedInAt || null,
      printJobId: data.printJobId || null
    };
  }

  // Atomic operation to check and update status
  static async tryCheckIn(attendeeId, attendeeData) {
    const key = `attendee:${attendeeId}`;
    
    // Use Redis transaction for atomicity
    const result = await redis
      .multi()
      .hsetnx(key, 'status', 'pending')
      .hsetnx(key, 'name', attendeeData.name)
      .hsetnx(key, 'id', attendeeId)
      .exec();

    const statusSet = result[0][1];
    
    if (statusSet === 1) {
      return { success: true, isDuplicate: false };
    } else {
      const currentStatus = await redis.hget(key, 'status');
      return { 
        success: false, 
        isDuplicate: true,
        currentStatus: currentStatus
      };
    }
  }

  // Update status when webhook received
  static async updateStatus(attendeeId, status, printJobId) {
    const key = `attendee:${attendeeId}`;
    const updates = {
      status: status,
      printJobId: printJobId
    };
    
    if (status === 'checked_in') {
      updates.checkedInAt = new Date().toISOString();
    }

    await redis.hset(key, updates);
    return await this.getStatus(attendeeId);
  }
}

module.exports = AttendeeModel;
