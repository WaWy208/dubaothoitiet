# MongoDB Setup

1. Open MongoDB Compass.
2. Connect to your MongoDB server.
3. Copy the connection string.

Examples:
- `mongodb://127.0.0.1:27017`
- `mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority`

4. Create `.env` from `.env.example`.
5. Fill it like this:

```env
PORT=3000
MONGODB_URI=your_connection_string
MONGODB_DB=weather_app
NODE_ENV=development
```

6. Install dependencies:
   `npm install`
7. Run the app:
   `npm run dev`

Notes:
- Local development can use `mongodb://127.0.0.1:27017`
- On deploy, set `MONGODB_URI` explicitly and prefer MongoDB Atlas
- In production, the app no longer silently falls back to localhost

Collections created automatically:
- `weather_history`
- `weather_reports`
