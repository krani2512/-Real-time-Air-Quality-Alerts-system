// server.js - Main application entry point
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');
const morgan = require('morgan');
const dotenv = require('dotenv');
const passport = require('passport');
const schedule = require('node-schedule');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const aqiRoutes = require('./routes/aqi');
const alertRoutes = require('./routes/alerts');

// Import services
const { checkAirQualityAndAlert } = require('./services/alertService');

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(morgan('dev'));
app.use(passport.initialize());

// Configure passport
require('./config/passport')(passport);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/aqi', aqiRoutes);
app.use('/api/alerts', alertRoutes);

// Schedule AQI checks and alerts
schedule.scheduleJob('*/15 * * * *', checkAirQualityAndAlert); // Run every 15 minutes

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong',
    error: process.env.NODE_ENV === 'development' ? err.message : {}
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  locations: [{
    name: String,
    latitude: Number,
    longitude: Number,
    isPrimary: Boolean
  }],
  alertPreferences: {
    threshold: {
      type: Number,
      default: 100 // Default alert at AQI 100 (Unhealthy for Sensitive Groups)
    },
    notificationMethods: {
      pushNotification: {
        type: Boolean,
        default: true
      },
      email: {
        type: Boolean,
        default: false
      }
    }
  },
  deviceTokens: [String], // For push notifications
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Hash password before saving
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Compare password method
UserSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', UserSchema);

// models/AqiHistory.js
const mongoose = require('mongoose');

const AqiHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  location: {
    name: String,
    latitude: Number,
    longitude: Number
  },
  aqi: {
    value: Number,
    category: String, // Good, Moderate, Unhealthy for Sensitive Groups, etc.
    pollutant: String, // PM2.5, PM10, O3, etc.
    source: String     // Data source
  },
  recordedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('AqiHistory', AqiHistorySchema);

// models/Alert.js
const mongoose = require('mongoose');

const AlertSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  location: {
    name: String,
    latitude: Number,
    longitude: Number
  },
  aqi: {
    value: Number,
    category: String,
    pollutant: String
  },
  message: String,
  recommendations: [String],
  acknowledged: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Alert', AlertSchema);

// services/aqiService.js - Handle AQI data fetching and processing
const axios = require('axios');

// AQI category thresholds
const AQI_CATEGORIES = [
  { max: 50, category: 'Good', color: '#00E400' },
  { max: 100, category: 'Moderate', color: '#FFFF00' },
  { max: 150, category: 'Unhealthy for Sensitive Groups', color: '#FF7E00' },
  { max: 200, category: 'Unhealthy', color: '#FF0000' },
  { max: 300, category: 'Very Unhealthy', color: '#8F3F97' },
  { max: 500, category: 'Hazardous', color: '#7E0023' }
];

// Get AQI category based on value
const getAqiCategory = (aqiValue) => {
  for (const cat of AQI_CATEGORIES) {
    if (aqiValue <= cat.max) {
      return {
        category: cat.category,
        color: cat.color
      };
    }
  }
  return { category: 'Extreme', color: '#7E0023' };
};

// Get recommendations based on AQI category
const getRecommendations = (aqiCategory) => {
  switch (aqiCategory) {
    case 'Good':
      return ['Air quality is good. Enjoy outdoor activities.'];
    case 'Moderate':
      return [
        'Air quality is acceptable.',
        'Unusually sensitive people should consider reducing prolonged outdoor exertion.'
      ];
    case 'Unhealthy for Sensitive Groups':
      return [
        'People with respiratory or heart disease, the elderly and children should limit prolonged outdoor exertion.',
        'Consider moving activities indoors or rescheduling.'
      ];
    case 'Unhealthy':
      return [
        'People with respiratory or heart disease, the elderly and children should avoid prolonged outdoor exertion.',
        'Everyone should limit outdoor exertion.',
        'Consider wearing masks outdoors.'
      ];
    case 'Very Unhealthy':
      return [
        'Everyone should avoid outdoor physical activities.',
        'People with respiratory or heart disease, the elderly and children should remain indoors.',
        'Keep windows and doors closed.',
        'Use air purifiers if available.'
      ];
    case 'Hazardous':
      return [
        'Everyone should avoid all outdoor physical activities.',
        'Remain indoors with windows and doors closed.',
        'Use air purifiers if available.',
        'Follow evacuation orders if issued by local authorities.'
      ];
    default:
      return [
        'Avoid all outdoor activities.',
        'Remain indoors with air purifiers if available.',
        'Follow emergency instructions from local authorities.'
      ];
  }
};

// Fetch AQI data from external API
const fetchAqiData = async (latitude, longitude) => {
  try {
    // Using example API - replace with your preferred AQI data provider
    const response = await axios.get(`https://api.waqi.info/feed/geo:${latitude};${longitude}/?token=${process.env.AQI_API_TOKEN}`);
    
    if (response.data && response.data.status === 'ok') {
      const aqiValue = response.data.data.aqi;
      const dominantPollutant = response.data.data.dominentpol;
      const { category } = getAqiCategory(aqiValue);
      
      return {
        value: aqiValue,
        category,
        pollutant: dominantPollutant,
        source: 'WAQI'
      };
    }
    throw new Error('Invalid data received from AQI API');
  } catch (error) {
    console.error('Error fetching AQI data:', error);
    throw error;
  }
};

module.exports = {
  fetchAqiData,
  getAqiCategory,
  getRecommendations
};

// services/alertService.js - Handle alert generation and sending
const User = require('../models/User');
const Alert = require('../models/Alert');
const AqiHistory = require('../models/AqiHistory');
const { fetchAqiData, getAqiCategory, getRecommendations } = require('./aqiService');
const { sendPushNotification } = require('./notificationService');

// Check AQI for all users' locations and send alerts if needed
const checkAirQualityAndAlert = async () => {
  try {
    const users = await User.find();
    
    for (const user of users) {
      // Check each user location
      for (const location of user.locations) {
        const { latitude, longitude } = location;
        
        // Fetch current AQI data
        const aqiData = await fetchAqiData(latitude, longitude);
        
        // Store AQI history
        await new AqiHistory({
          userId: user._id,
          location,
          aqi: aqiData,
        }).save();
        
        // Check if AQI exceeds user's threshold
        if (aqiData.value >= user.alertPreferences.threshold) {
          // Create alert
          const { category } = getAqiCategory(aqiData.value);
          const recommendations = getRecommendations(category);
          
          const alert = await new Alert({
            userId: user._id,
            location,
            aqi: aqiData,
            message: `Air quality alert: ${aqiData.value} (${category}) in ${location.name}`,
            recommendations
          }).save();
          
          // Send push notification if enabled
          if (user.alertPreferences.notificationMethods.pushNotification && user.deviceTokens.length > 0) {
            for (const token of user.deviceTokens) {
              await sendPushNotification(token, {
                title: `Air Quality Alert: ${category}`,
                body: `Current AQI: ${aqiData.value} in ${location.name}`,
                data: {
                  alertId: alert._id.toString(),
                  aqiValue: aqiData.value,
                  category,
                  location: location.name
                }
              });
            }
          }
          
          // Send email if enabled
          if (user.alertPreferences.notificationMethods.email) {
            // Implement email sending logic here
          }
        }
      }
    }
    console.log('AQI check and alert process completed');
  } catch (error) {
    console.error('Error checking AQI and sending alerts:', error);
    throw error;
  }
};

module.exports = {
  checkAirQualityAndAlert
};

// services/notificationService.js - Handle push notifications
const admin = require('firebase-admin');

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  })
});

// Send push notification
const sendPushNotification = async (token, notification) => {
  try {
    const message = {
      token,
      notification: {
        title: notification.title,
        body: notification.body
      },
      data: notification.data
    };
    
    const response = await admin.messaging().send(message);
    console.log('Successfully sent notification:', response);
    return response;
  } catch (error) {
    console.error('Error sending notification:', error);
    throw error;
  }
};

module.exports = {
  sendPushNotification
};

// routes/auth.js - Authentication routes
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const passport = require('passport');
const User = require('../models/User');

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Email already in use'
      });
    }
    
    // Create new user
    const newUser = new User({
      email,
      password,
      name
    });
    
    await newUser.save();
    
    // Generate JWT token
    const token = jwt.sign({ id: newUser._id }, process.env.JWT_SECRET, {
      expiresIn: '7d'
    });
    
    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: newUser._id,
        email: newUser.email,
        name: newUser.name
      }
    });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({
      success: false,
      message: 'Error registering user',
      error: error.message
    });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Check password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Generate JWT token
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: '7d'
    });
    
    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name
      }
    });
  } catch (error) {
    console.error('Error logging in user:', error);
    res.status(500).json({
      success: false,
      message: 'Error logging in user',
      error: error.message
    });
  }
});

// Register device token for push notifications
router.post('/register-device', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const { deviceToken } = req.body;
    const userId = req.user._id;
    
    // Add device token if it doesn't exist already
    await User.findByIdAndUpdate(
      userId,
      { $addToSet: { deviceTokens: deviceToken } },
      { new: true }
    );
    
    res.status(200).json({
      success: true,
      message: 'Device token registered successfully'
    });
  } catch (error) {
    console.error('Error registering device token:', error);
    res.status(500).json({
      success: false,
      message: 'Error registering device token',
      error: error.message
    });
  }
});

module.exports = router;

// routes/aqi.js - AQI data routes
const express = require('express');
const router = express.Router();
const passport = require('passport');
const { fetchAqiData, getAqiCategory, getRecommendations } = require('../services/aqiService');
const AqiHistory = require('../models/AqiHistory');

// Get current AQI for coordinates
router.get('/current', async (req, res) => {
  try {
    const { latitude, longitude } = req.query;
    
    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude and longitude are required'
      });
    }
    
    const aqiData = await fetchAqiData(latitude, longitude);
    const { category } = getAqiCategory(aqiData.value);
    const recommendations = getRecommendations(category);
    
    res.status(200).json({
      success: true,
      data: {
        ...aqiData,
        recommendations
      }
    });
  } catch (error) {
    console.error('Error fetching AQI data:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching AQI data',
      error: error.message
    });
  }
});

// Get user's AQI history
router.get('/history', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const userId = req.user._id;
    const { location, startDate, endDate, limit = 100 } = req.query;
    
    // Build query
    const query = { userId };
    
    if (location) {
      query['location.name'] = location;
    }
    
    if (startDate || endDate) {
      query.recordedAt = {};
      if (startDate) query.recordedAt.$gte = new Date(startDate);
      if (endDate) query.recordedAt.$lte = new Date(endDate);
    }
    
    // Fetch history
    const history = await AqiHistory
      .find(query)
      .sort({ recordedAt: -1 })
      .limit(parseInt(limit))
      .exec();
    
    res.status(200).json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('Error fetching AQI history:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching AQI history',
      error: error.message
    });
  }
});

// Get AQI trend analysis
router.get('/trend', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const userId = req.user._id;
    const { location, period = 'week' } = req.query;
    
    // Calculate date range based on period
    const endDate = new Date();
    let startDate = new Date();
    
    switch (period) {
      case 'day':
        startDate.setDate(endDate.getDate() - 1);
        break;
      case 'week':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(endDate.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(endDate.getDate() - 7); // Default to week
    }
    
    // Build query
    const query = { 
      userId,
      recordedAt: { $gte: startDate, $lte: endDate }
    };
    
    if (location) {
      query['location.name'] = location;
    }
    
    // Fetch data
    const data = await AqiHistory.find(query).sort({ recordedAt: 1 });
    
    // Process data for trend analysis
    const trends = {
      averageAqi: 0,
      maxAqi: 0,
      minAqi: Infinity,
      dataPoints: []
    };
    
    if (data.length > 0) {
      let totalAqi = 0;
      
      data.forEach(point => {
        totalAqi += point.aqi.value;
        
        trends.maxAqi = Math.max(trends.maxAqi, point.aqi.value);
        trends.minAqi = Math.min(trends.minAqi, point.aqi.value);
        
        trends.dataPoints.push({
          date: point.recordedAt,
          value: point.aqi.value,
          category: point.aqi.category
        });
      });
      
      trends.averageAqi = totalAqi / data.length;
    }
    
    res.status(200).json({
      success: true,
      data: trends
    });
  } catch (error) {
    console.error('Error generating AQI trend:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating AQI trend',
      error: error.message
    });
  }
});

module.exports = router;

// routes/alerts.js - Alert management routes
const express = require('express');
const router = express.Router();
const passport = require('passport');
const Alert = require('../models/Alert');

// Get user's alerts
router.get('/', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const userId = req.user._id;
    const { acknowledged, limit = 10 } = req.query;
    
    // Build query
    const query = { userId };
    
    if (acknowledged !== undefined) {
      query.acknowledged = acknowledged === 'true';
    }
    
    // Fetch alerts
    const alerts = await Alert
      .find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .exec();
    
    res.status(200).json({
      success: true,
      data: alerts
    });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching alerts',
      error: error.message
    });
  }
});

// Mark alert as acknowledged
router.put('/:id/acknowledge', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const alertId = req.params.id;
    const userId = req.user._id;
    
    // Find and update alert
    const alert = await Alert.findOneAndUpdate(
      { _id: alertId, userId },
      { acknowledged: true },
      { new: true }
    );
    
    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: alert
    });
  } catch (error) {
    console.error('Error acknowledging alert:', error);
    res.status(500).json({
      success: false,
      message: 'Error acknowledging alert',
      error: error.message
    });
  }
});

// Delete an alert
router.delete('/:id', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const alertId = req.params.id;
    const userId = req.user._id;
    
    // Find and delete alert
    const alert = await Alert.findOneAndDelete({ _id: alertId, userId });
    
    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Alert deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting alert:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting alert',
      error: error.message
    });
  }
});

module.exports = router;

// routes/users.js - User management routes
const express = require('express');
const router = express.Router();
const passport = require('passport');
const User = require('../models/User');

// Get user profile
router.get('/profile', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Find user and exclude password
    const user = await User.findById(userId).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching user profile',
      error: error.message
    });
  }
});

// Update user profile
router.put('/profile', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const userId = req.user._id;
    const { name, email } = req.body;
    
    // Build update object
    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    
    // Update user
    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true }
    ).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: user
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating user profile',
      error: error.message
    });
  }
});

// Add user location
router.post('/locations', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const userId = req.user._id;
    const { name, latitude, longitude, isPrimary } = req.body;
    
    // Validate required fields
    if (!name || latitude === undefined || longitude === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Name, latitude, and longitude are required'
      });
    }
    
    const newLocation = {
      name,
      latitude,
      longitude,
      isPrimary: !!isPrimary
    };
    
    // If this is marked as primary, update all other locations to non-primary
    if (isPrimary) {
      await User.updateOne(
        { _id: userId },
        { $set: { 'locations.$[].isPrimary': false } }
      );
    }
    
    // Add new location
    const user = await User.findByIdAndUpdate(
      userId,
      { $push: { locations: newLocation } },
      { new: true }
    ).select('-password');
    
    res.status(200).json({
      success: true,
      message: 'Location added successfully',
      data: user.locations
    });
  } catch (error) {
    console.error('Error adding location:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding location',
      error: error.message
    });
  }
});

// Update user alert preferences
router.put('/alert-preferences', passport.authenticate('jwt', { session: false }), async (req, res) => {
  try {
    const userId = req.user._id;
    const { threshold, notificationMethods } = req.body;
    
    // Build update object
    const updateData = { alertPreferences: {} };
    
    if (threshold !== undefined) {
      updateData.alertPreferences.threshold = threshold;
    }
    
    if (notificationMethods) {
      updateData.alertPreferences.notificationMethods = notificationMethods;
    }
    
    // Update user
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true }
    ).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    res.status(200).json({
      success: true,
      message: 'Alert preferences updated successfully',
      data: user.alertPreferences
    });
  } catch (error) {
    console.error('Error updating alert preferences:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating alert preferences',
      error: error.message
    });
  }
});

module.exports = router;

// config/passport.js - Passport configuration for JWT authentication
const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
const User = require('../models/User');

const options = {
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  secretOrKey: process.env.JWT_SECRET
};

module.exports = (passport) => {
  passport.use(
    new JwtStrategy(options, async (payload, done) => {
      try {
        // Find user by ID from JWT payload
        const user = await User.findById(payload.id);
        
        if (user) {
          return done(null, user);
        }
        return done(null, false);
      } catch (error) {
        console.error('Error in passport JWT strategy:', error);
        return done(error, false);
      }
    })
  );
};
