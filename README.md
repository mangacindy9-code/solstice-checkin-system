# Solstice Events - Check-in System

## Description
Event check-in kiosk service with asynchronous print processing and webhook callbacks.

## Technologies Used
- Node.js
- Express.js
- Redis (in-memory database)
- Bull (message queue)
- Webhooks for async processing

## Features
- ✅ QR code check-in
- ✅ Duplicate scan protection
- ✅ Asynchronous print processing
- ✅ Webhook callbacks
- ✅ Status tracking (pending → printing → checked_in)

## Installation
```bash
npm install
