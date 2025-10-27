// ============================================
// DATABASE SETUP - SQLite Implementation
// ============================================
// This file upgrades the booking system from JSON to SQLite database

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Database file location
const DB_PATH = path.join(__dirname, 'data', 'bookings.db');
const OLD_JSON_PATH = path.join(__dirname, 'data', 'bookings.json');

// Create data directory if it doesn't exist
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

// Initialize database
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error opening database:', err);
  } else {
    console.log('✅ Connected to SQLite database');
    initializeDatabase();
  }
});

// Create tables
function initializeDatabase() {
  db.serialize(() => {
    // Bookings table
    db.run(`
      CREATE TABLE IF NOT EXISTS bookings (
        id TEXT PRIMARY KEY,
        firstName TEXT NOT NULL,
        lastName TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        service TEXT NOT NULL,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        notes TEXT,
        price TEXT,
        status TEXT DEFAULT 'confirmed',
        createdAt TEXT NOT NULL,
        updatedAt TEXT
      )
    `, (err) => {
      if (err) {
        console.error('Error creating bookings table:', err);
      } else {
        console.log('✅ Bookings table ready');
        // Create index for faster queries
        db.run('CREATE INDEX IF NOT EXISTS idx_date ON bookings(date)');
        db.run('CREATE INDEX IF NOT EXISTS idx_email ON bookings(email)');
        
        // Migrate data from JSON if exists
        migrateFromJSON();
      }
    });

    // Availability table (optional - for managing doctor's schedule)
    db.run(`
      CREATE TABLE IF NOT EXISTS availability (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        available INTEGER DEFAULT 1,
        UNIQUE(date, time)
      )
    `);

    // Settings table (for clinic configuration)
    db.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
  });
}

// Migrate data from old JSON file to SQLite
function migrateFromJSON() {
  if (!fs.existsSync(OLD_JSON_PATH)) {
    console.log('ℹ️  No JSON file to migrate');
    return;
  }

  try {
    const jsonData = fs.readFileSync(OLD_JSON_PATH, 'utf8');
    const data = JSON.parse(jsonData);
    
    if (data.bookings && data.bookings.length > 0) {
      console.log(`📦 Migrating ${data.bookings.length} bookings from JSON...`);
      
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO bookings 
        (id, firstName, lastName, email, phone, service, date, time, notes, price, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      data.bookings.forEach(booking => {
        stmt.run(
          booking.id,
          booking.firstName,
          booking.lastName,
          booking.email,
          booking.phone,
          booking.service,
          booking.date,
          booking.time,
          booking.notes || null,
          booking.price || null,
          booking.createdAt
        );
      });

      stmt.finalize((err) => {
        if (err) {
          console.error('Error migrating data:', err);
        } else {
          console.log('✅ Migration complete! Data moved to SQLite');
          
          // Backup JSON file
          const backupPath = OLD_JSON_PATH + '.backup';
          fs.copyFileSync(OLD_JSON_PATH, backupPath);
          console.log(`💾 Original JSON backed up to: ${backupPath}`);
        }
      });
    }
  } catch (error) {
    console.error('Error reading JSON file:', error);
  }
}

// Database query helpers
const dbHelpers = {
  // Get all bookings
  getAllBookings: () => {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM bookings ORDER BY date DESC, time DESC', [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },

  // Get bookings for a specific date
  getBookingsByDate: (date) => {
    return new Promise((resolve, reject) => {
      db.all('SELECT * FROM bookings WHERE date = ? ORDER BY time', [date], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },

  // Get bookings in date range
  getBookingsInRange: (startDate, endDate) => {
    return new Promise((resolve, reject) => {
      db.all(
        'SELECT * FROM bookings WHERE date BETWEEN ? AND ? ORDER BY date, time',
        [startDate, endDate],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  },

  // Check if time slot is available
  isTimeSlotAvailable: (date, time) => {
    return new Promise((resolve, reject) => {
      db.get(
        'SELECT COUNT(*) as count FROM bookings WHERE date = ? AND time = ?',
        [date, time],
        (err, row) => {
          if (err) reject(err);
          else resolve(row.count === 0);
        }
      );
    });
  },

  // Create new booking
  createBooking: (booking) => {
    return new Promise((resolve, reject) => {
      const stmt = db.prepare(`
        INSERT INTO bookings 
        (id, firstName, lastName, email, phone, service, date, time, notes, price, createdAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        booking.id,
        booking.firstName,
        booking.lastName,
        booking.email,
        booking.phone,
        booking.service,
        booking.date,
        booking.time,
        booking.notes || null,
        booking.price || null,
        booking.createdAt,
        function(err) {
          if (err) reject(err);
          else resolve({ id: booking.id, changes: this.changes });
        }
      );

      stmt.finalize();
    });
  },

  // Update booking
  updateBooking: (id, updates) => {
    return new Promise((resolve, reject) => {
      const fields = Object.keys(updates);
      const values = Object.values(updates);
      const setClause = fields.map(f => `${f} = ?`).join(', ');
      
      values.push(id);
      
      db.run(
        `UPDATE bookings SET ${setClause}, updatedAt = datetime('now') WHERE id = ?`,
        values,
        function(err) {
          if (err) reject(err);
          else resolve({ changes: this.changes });
        }
      );
    });
  },

  // Delete booking
  deleteBooking: (id) => {
    return new Promise((resolve, reject) => {
      db.run('DELETE FROM bookings WHERE id = ?', [id], function(err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
  },

  // Get booking by ID
  getBookingById: (id) => {
    return new Promise((resolve, reject) => {
      db.get('SELECT * FROM bookings WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },

  // Search bookings
  searchBookings: (query) => {
    return new Promise((resolve, reject) => {
      const searchTerm = `%${query}%`;
      db.all(
        `SELECT * FROM bookings 
         WHERE firstName LIKE ? OR lastName LIKE ? OR email LIKE ? OR phone LIKE ?
         ORDER BY date DESC, time DESC`,
        [searchTerm, searchTerm, searchTerm, searchTerm],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  },

  // Get statistics
  getStats: () => {
    return new Promise((resolve, reject) => {
      const today = new Date().toISOString().split('T')[0];
      
      db.all(`
        SELECT 
          (SELECT COUNT(*) FROM bookings) as total,
          (SELECT COUNT(*) FROM bookings WHERE date = ?) as today,
          (SELECT COUNT(*) FROM bookings WHERE date >= ?) as upcoming,
          (SELECT COUNT(*) FROM bookings WHERE date < ?) as past
      `, [today, today, today], (err, rows) => {
        if (err) reject(err);
        else resolve(rows[0]);
      });
    });
  }
};

module.exports = { db, dbHelpers };
