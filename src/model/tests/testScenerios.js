const Redis = require('ioredis');

const redis = new Redis({
  host: 'localhost',
  port: 6379,
  retryStrategy: (times) => Math.min(times * 50, 2000)
});

redis.on('connect', () => console.log('✅ Redis connected'));
redis.on('error', (err) => console.error('❌ Redis error:', err));

module.exports 
