# OPD Token Allocation Backend (Express + MongoDB)

Simple college-level Express.js backend for hospital OPD token allocation with priority-based slot handling and a day simulation endpoint.

## Tech Stack
- Node.js, Express.js
- MongoDB with Mongoose
- No auth, no frontend

## Project Structure
```
src/
 ├─ models/
 │   ├─ Doctor.js
 │   ├─ Slot.js
 │   └─ Token.js
 ├─ routes/
 │   └─ tokenRoutes.js
 ├─ controllers/
 │   └─ tokenController.js
 ├─ utils/
 │   └─ priority.js
 ├─ app.js
 └─ server.js
```

## Setup
1) Install dependencies
```
npm install
```

2) Environment variables  
Create `.env` (see `.env.example`):
```
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/opd_tokens
```
Replace `MONGODB_URI` with your MongoDB connection string (already provided in `.env` here).

3) Run the server
```
npm run dev   # with nodemon
# or
npm start
```
Server starts on `http://localhost:5000`.

## Priority Mapping
`EMERGENCY > PAID > FOLLOW_UP > ONLINE > WALK_IN` (numeric, higher is higher priority).

## Core Endpoints
- **Create Token**: `POST /api/tokens`  
  Body: `{ "doctorId": "", "slotId": "", "source": "ONLINE" }`

- **Cancel Token**: `PATCH /api/tokens/:id/cancel`

- **Emergency Token**: `POST /api/tokens/emergency`  
  Body: `{ "doctorId": "", "slotId": "" }`

- **View Slots for Doctor**: `GET /api/doctors/:id/slots`

- **Simulate Day**: `POST /api/simulate/day`

## Token Allocation (simplified)
- If requested slot has room → assign.
- If full → find lowest-priority active non-emergency token:
  - If incoming has higher priority → move the lowest token to the next available slot (same doctor), then assign incoming.
  - Else → reject.
- Emergency tokens always allowed (do not consume `currentCount`).

## Cancel Logic
- Mark token `CANCELLED`.
- If it was a non-emergency active token, decrement slot `currentCount`.
- Try to pull a higher-priority token from a later slot (same doctor) into the freed slot if space exists.

## Simulation
`POST /api/simulate/day` performs:
- Create 3 doctors.
- Create 3 slots per doctor.
- Add mixed tokens, add one emergency token, cancel one token.
- Returns final doctors, slots, tokens.

## Notes
- No Redis, queues, or background jobs.
- Low-traffic, straightforward controllers.
