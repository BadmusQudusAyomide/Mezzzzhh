# Mesh

Mesh is a full-stack social platform with a React frontend and an Express/MongoDB backend. It includes authentication, profiles, a social feed, direct messaging, notifications, media uploads, OAuth login, and PWA support.

## Stack

- Frontend: React 19, TypeScript, Vite, Tailwind CSS, React Router
- Backend: Node.js, Express, MongoDB, Mongoose, Socket.IO
- Media and delivery: Cloudinary, Web Push, service worker

## Features

- Email/password authentication with JWT
- Google and GitHub OAuth login
- Password reset flow
- User profiles with editable extended info
- Follow and unfollow system
- Post creation with likes and comments
- Real-time notifications
- Direct messages with reactions, replies, edits, deletes, and unread counts
- Voice, image, and video messaging
- PWA install support and push notifications

## Project Structure

```text
mesh/      Frontend application
backend/   Express API and realtime server
```

## Local Development

### Frontend

```bash
cd mesh
npm install
npm run dev
```

### Backend

```bash
cd backend
npm install
copy env.example .env
npm run dev
```

The frontend runs on `http://localhost:5173` and the backend runs on `http://localhost:5000` by default.

## Production Build

```bash
cd mesh
npm run build
```

## Notes

- Configure Cloudinary if you want media uploads to work.
- Configure SMTP values in `backend/.env` if you want password reset emails to send. If email is not configured, the backend still generates reset links and logs them during development.
