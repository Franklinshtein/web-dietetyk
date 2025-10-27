// ============================================
// BOOKING SYSTEM BACKEND - server.js
// ============================================
// This file handles appointment bookings for the clinic website
// It checks availability, saves bookings, and sends email notifications

const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Create Express app
const app = express();

// ============================================
// CONFIGURATION - Works for both local and cloud deployment
// ============================================
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0'; // Bind to all interfaces for cloud deployment
const NODE_ENV = process.env.NODE_ENV || 'development';

// Middleware - allows the server to understand JSON and handle cross-origin requests
app.use(cors()); // Allows frontend to communicate with backend
app.use(express.json()); // Allows reading JSON data from requests

// ============================================
// FILE PATHS - Where we store booking data
// ============================================
const DATA_DIR = path.join(__dirname, 'data');
const BOOKINGS_FILE = path.join(DATA_DIR, 'bookings.json');

// Create data directory if it doesn't exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

// Create bookings file if it doesn't exist
if (!fs.existsSync(BOOKINGS_FILE)) {
  fs.writeFileSync(BOOKINGS_FILE, JSON.stringify({ bookings: [] }, null, 2));
}

// ============================================
// EMAIL CONFIGURATION - Using Environment Variables
// ============================================
// IMPORTANT: Set these as environment variables in Railway:
// - EMAIL_SERVICE (e.g., 'gmail')
// - EMAIL_USER (your email address)
// - EMAIL_PASS (your app password)
const emailConfig = {
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'xgod7x@gmail.com',
    pass: process.env.EMAIL_PASS || 'tnuv vwkc vpky wres'
  }
};

// Create email transporter
const transporter = nodemailer.createTransport(emailConfig);

// Verify email configuration on startup
transporter.verify((error, success) => {
  if (error) {
    console.warn('⚠️  Email service not configured properly:', error.message);
    console.warn('   Emails will not be sent. Set EMAIL_USER and EMAIL_PASS environment variables.');
  } else {
    console.log('✅ Email service is ready');
  }
});

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Read all bookings from file
 */
function readBookings() {
  try {
    const data = fs.readFileSync(BOOKINGS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading bookings:', error);
    return { bookings: [] };
  }
}

/**
 * Save bookings to file
 */
function saveBookings(data) {
  try {
    fs.writeFileSync(BOOKINGS_FILE, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving bookings:', error);
    return false;
  }
}

/**
 * Check if a time slot is available
 */
function isTimeSlotAvailable(date, time) {
  const data = readBookings();
  
  // Check if there's already a booking for this date and time
  const existingBooking = data.bookings.find(
    booking => booking.date === date && booking.time === time
  );
  
  return !existingBooking; // Returns true if slot is free
}

/**
 * Send email notification to clinic
 */
async function sendClinicNotification(booking) {
  const mailOptions = {
    from: emailConfig.auth.user,
    to: process.env.CLINIC_EMAIL || 'harmonia.sibo@gmail.com', // Clinic email
    subject: `Nowa rezerwacja: ${booking.service}`,
    html: `
      <h2>Nowa rezerwacja wizyty</h2>
      <p><strong>Pacjent:</strong> ${booking.firstName} ${booking.lastName}</p>
      <p><strong>Email:</strong> ${booking.email}</p>
      <p><strong>Telefon:</strong> ${booking.phone}</p>
      <p><strong>Usługa:</strong> ${booking.service}</p>
      <p><strong>Data:</strong> ${booking.date}</p>
      <p><strong>Godzina:</strong> ${booking.time}</p>
      <p><strong>Cena:</strong> ${booking.price}</p>
      ${booking.notes ? `<p><strong>Notatki:</strong> ${booking.notes}</p>` : ''}
      <hr>
      <p><small>ID rezerwacji: ${booking.id}</small></p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('✅ Clinic notification sent successfully');
    return true;
  } catch (error) {
    console.error('❌ Error sending clinic notification:', error);
    return false;
  }
}

/**
 * Send confirmation email to client
 */
async function sendClientConfirmation(booking) {
  const mailOptions = {
    from: emailConfig.auth.user,
    to: booking.email,
    subject: 'Potwierdzenie rezerwacji - HARMONIA',
    html: `
      <h2>Dziękujemy za rezerwację!</h2>
      <p>Szanowny/a ${booking.firstName} ${booking.lastName},</p>
      <p>Potwierdzamy Twoją rezerwację:</p>
      <ul>
        <li><strong>Usługa:</strong> ${booking.service}</li>
        <li><strong>Data:</strong> ${booking.date}</li>
        <li><strong>Godzina:</strong> ${booking.time}</li>
        <li><strong>Cena:</strong> ${booking.price}</li>
      </ul>
      <p><strong>Adres:</strong> ul. Zacisze 16/1, 31-156 Kraków</p>
      <p>Prosimy o przybycie 5 minut przed umówioną godziną.</p>
      <p>W razie pytań prosimy o kontakt:</p>
      <ul>
        <li>Tel: 692 922 926</li>
        <li>Email: harmonia.sibo@gmail.com</li>
      </ul>
      <hr>
      <p><small>Numer rezerwacji: ${booking.id}</small></p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('✅ Client confirmation sent successfully');
    return true;
  } catch (error) {
    console.error('❌ Error sending client confirmation:', error);
    return false;
  }
}

// ============================================
// API ENDPOINTS
// ============================================

/**
 * GET /api/status - API status check endpoint
 * Useful for monitoring and deployment verification
 */
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ok',
    message: 'HARMONIA Booking System API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /health - Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

/**
 * GET /api/available-times
 * Returns available time slots for a specific date
 */
app.get('/api/available-times', (req, res) => {
  const { date } = req.query;
  
  if (!date) {
    return res.status(400).json({ error: 'Date parameter is required' });
  }

  // All possible time slots
  const allTimeSlots = [
    '08:00', '09:00', '10:00', '11:00', '12:00',
    '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'
  ];

  // Get all bookings for this date
  const data = readBookings();
  const bookedTimes = data.bookings
    .filter(booking => booking.date === date)
    .map(booking => booking.time);

  // Filter out booked times
  const availableTimes = allTimeSlots.filter(time => !bookedTimes.includes(time));

  res.json({ 
    date, 
    availableTimes,
    bookedTimes 
  });
});

/**
 * POST /api/bookings
 * Creates a new booking
 */
app.post('/api/bookings', async (req, res) => {
  const { firstName, lastName, email, phone, service, date, time, notes, price } = req.body;

  // Validation - check if all required fields are present
  if (!firstName || !lastName || !email || !phone || !service || !date || !time) {
    return res.status(400).json({ 
      error: 'Wszystkie wymagane pola muszą być wypełnione' 
    });
  }

  // Check if time slot is still available
  if (!isTimeSlotAvailable(date, time)) {
    return res.status(409).json({ 
      error: 'Ten termin jest już zajęty. Proszę wybrać inny.' 
    });
  }

  // Create new booking object
  const newBooking = {
    id: Date.now().toString(), // Simple ID based on timestamp
    firstName,
    lastName,
    email,
    phone,
    service,
    date,
    time,
    notes: notes || '',
    price: price || '',
    createdAt: new Date().toISOString()
  };

  // Save booking
  const data = readBookings();
  data.bookings.push(newBooking);
  
  if (!saveBookings(data)) {
    return res.status(500).json({ 
      error: 'Błąd podczas zapisywania rezerwacji' 
    });
  }

  // Send email notifications
  // Note: We don't wait for emails to avoid slow response
  sendClinicNotification(newBooking).catch(err => 
    console.error('Failed to send clinic notification:', err)
  );
  
  sendClientConfirmation(newBooking).catch(err => 
    console.error('Failed to send client confirmation:', err)
  );

  // Send success response
  res.status(201).json({
    success: true,
    message: 'Rezerwacja została pomyślnie utworzona',
    booking: {
      id: newBooking.id,
      date: newBooking.date,
      time: newBooking.time,
      service: newBooking.service
    }
  });
});

/**
 * GET /api/bookings
 * Returns all bookings (for admin purposes)
 */
app.get('/api/bookings', (req, res) => {
  const data = readBookings();
  res.json(data.bookings);
});

/**
 * DELETE /api/bookings/:id
 * Deletes a booking by ID (for admin purposes)
 */
app.delete('/api/bookings/:id', (req, res) => {
  const { id } = req.params;
  
  const data = readBookings();
  const bookingIndex = data.bookings.findIndex(b => b.id === id);
  
  if (bookingIndex === -1) {
    return res.status(404).json({ error: 'Rezerwacja nie znaleziona' });
  }
  
  data.bookings.splice(bookingIndex, 1);
  saveBookings(data);
  
  res.json({ success: true, message: 'Rezerwacja została usunięta' });
});

// ============================================
// SERVE STATIC FILES (HTML, CSS, JS, Images)
// ============================================
// This serves your website files (index.html, etc.)
// Place this AFTER API routes so API takes priority
app.use(express.static(__dirname));

// Fallback for SPA-style routing - serve index.html for non-API routes
app.get('*', (req, res, next) => {
  // Skip if it's an API route or health check
  if (req.path.startsWith('/api/') || req.path === '/health') {
    return next();
  }
  
  // For all other routes, try to serve index.html
  const indexPath = path.join(__dirname, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    next();
  }
});

// ============================================
// ERROR HANDLING
// ============================================

// 404 handler for API routes only
app.use('/api/*', (req, res) => {
  res.status(404).json({ 
    error: 'API endpoint not found',
    path: req.path
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// ============================================
// START SERVER
// ============================================
const server = app.listen(PORT, HOST, () => {
  console.log('===========================================');
  console.log(`🚀 Booking system started!`);
  console.log(`📍 Environment: ${NODE_ENV}`);
  console.log(`🌐 Server running on: http://${HOST}:${PORT}`);
  if (NODE_ENV === 'production') {
    console.log(`🌍 Public URL: Check your hosting dashboard`);
  } else {
    console.log(`🏠 Local: http://localhost:${PORT}`);
  }
  console.log(`📁 Bookings saved to: ${BOOKINGS_FILE}`);
  console.log('===========================================');
  console.log('Available endpoints:');
  console.log(`  GET    /                                    → Website (index.html)`);
  console.log(`  GET    /health                              → Health check`);
  console.log(`  GET    /api/status                          → API status`);
  console.log(`  GET    /api/available-times?date=YYYY-MM-DD → Available slots`);
  console.log(`  POST   /api/bookings                        → Create booking`);
  console.log(`  GET    /api/bookings                        → List bookings`);
  console.log(`  DELETE /api/bookings/:id                    → Delete booking`);
  console.log('===========================================');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

module.exports = app; // Export for testing purposes
