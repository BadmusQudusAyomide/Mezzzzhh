# Mesh Backend API

Backend API for the Mesh social media platform built with Node.js, Express, MongoDB, and Mongoose.

## 🚀 Features

- **Authentication System** - JWT-based authentication with bcrypt password hashing
- **User Management** - User registration, login, profile management
- **Social Features** - Follow/unfollow, posts, comments, likes
- **Real-time Features** - WebSocket support for live interactions
- **File Upload** - Image and video upload with Cloudinary
- **Security** - Rate limiting, CORS, Helmet security headers
- **Email Notifications** - Nodemailer integration for notifications

## 🛠️ Tech Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT (JSON Web Tokens)
- **Password Hashing**: bcryptjs
- **File Upload**: Multer + Cloudinary
- **Email**: Nodemailer
- **Security**: Helmet, CORS, Rate Limiting
- **Logging**: Morgan

## 📋 Prerequisites

- Node.js (v16 or higher)
- MongoDB (local or Atlas)
- npm or yarn

## 🚀 Quick Start

### 1. Clone and Install

```bash
cd backend
npm install
```

### 2. Environment Setup

Copy the example environment file and configure it:

```bash
cp env.example .env
```

Update the `.env` file with your configuration:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/mesh

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d

# Frontend URL
FRONTEND_URL=http://localhost:5173

# Cloudinary Configuration (for image uploads)
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret

# Email Configuration (for notifications)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password
```

### 3. Start the Server

**Development mode:**

```bash
npm run dev
```

**Production mode:**

```bash
npm start
```

The server will start on `http://localhost:5000`

## 📚 API Endpoints

### Authentication

| Method | Endpoint             | Description              | Access  |
| ------ | -------------------- | ------------------------ | ------- |
| POST   | `/api/auth/register` | Register new user        | Public  |
| POST   | `/api/auth/login`    | Login user               | Public  |
| GET    | `/api/auth/me`       | Get current user profile | Private |
| PUT    | `/api/auth/profile`  | Update user profile      | Private |
| POST   | `/api/auth/logout`   | Logout user              | Private |

### Health Check

| Method | Endpoint      | Description          |
| ------ | ------------- | -------------------- |
| GET    | `/api/health` | Server health status |

## 🔧 Project Structure

```
backend/
├── src/
│   ├── controllers/     # Route controllers
│   ├── models/         # Mongoose models
│   ├── routes/         # Express routes
│   ├── middleware/     # Custom middleware
│   ├── config/         # Configuration files
│   └── utils/          # Utility functions
├── server.js           # Main server file
├── package.json        # Dependencies and scripts
└── env.example         # Environment variables template
```

## 🔐 Authentication

The API uses JWT (JSON Web Tokens) for authentication. Include the token in the Authorization header:

```
Authorization: Bearer <your-jwt-token>
```

## 📝 Example Requests

### Register User

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "johndoe",
    "email": "john@example.com",
    "password": "password123",
    "fullName": "John Doe"
  }'
```

### Login User

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "john@example.com",
    "password": "password123"
  }'
```

### Get Profile (with token)

```bash
curl -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer <your-jwt-token>"
```

## 🚀 Development

### Available Scripts

- `npm run dev` - Start development server with nodemon
- `npm start` - Start production server
- `npm test` - Run tests (to be implemented)

### Code Style

The project follows standard Node.js/Express conventions:

- Use async/await for asynchronous operations
- Proper error handling with try/catch
- Consistent API response format
- Input validation and sanitization

## 🔒 Security Features

- **Password Hashing**: bcryptjs for secure password storage
- **JWT Authentication**: Secure token-based authentication
- **Rate Limiting**: Prevents abuse with express-rate-limit
- **CORS**: Configured for frontend integration
- **Helmet**: Security headers for Express
- **Input Validation**: Request validation and sanitization

## 📈 Performance

- **Database Indexing**: Optimized MongoDB queries
- **Response Caching**: Implemented where appropriate
- **File Upload Optimization**: Efficient image/video handling
- **Rate Limiting**: Prevents server overload

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the ISC License.

## 🆘 Support

For support and questions, please open an issue in the repository.
