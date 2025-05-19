// routes/auth.js
const express = require('express');
const router = express.Router();
const passport = require('passport');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/emailService');
const logger = require('../utils/logger');
const { authenticateJWT } = require('../middleware/auth');

// Helper function to generate JWT token
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      name: user.name 
    }, 
    process.env.JWT_SECRET || 'your-jwt-secret', 
    { expiresIn: '7d' }
  );
};

// Register a new user
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Please provide all required fields' });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Create new user
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      accountType: 'local',
      verificationToken,
      alertSettings: {
        thresholds: {
          moderate: true,
          unhealthy: true,
          veryUnhealthy: true,
          hazardous: true
        },
        notificationMethods: {
          push: true,
          email: true
        }
      }
    });

    await newUser.save();

    // Send verification email
    await sendVerificationEmail(newUser.email, verificationToken);

    // Generate JWT
    const token = generateToken(newUser);

    res.status(201).json({
      success: true,
      message: 'Registration successful! Please verify your email.',
      token,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        emailVerified: newUser.emailVerified
      }
    });
  } catch (err) {
    logger.error('Registration error:', err);
    res.status(500).json({ success: false, message: 'Registration failed', error: err.message });
  }
});

// Verify email
router.get('/verify/:token', async (req, res) => {
  try {
    const { token } = req.params;
    
    const user = await User.findOne({ verificationToken: token });
    
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid verification token' });
    }
    
    user.emailVerified = true;
    user.verificationToken = undefined;
    await user.save();
    
    // Redirect to frontend verification success page
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/verification-success`);
  } catch (err) {
    logger.error('Email verification error:', err);
    res.status(500).json({ success: false, message: 'Email verification failed' });
  }
});

// Login with email/password
router.post('/login', (req, res, next) => {
  passport.authenticate('local', { session: false }, (err, user, info) => {
    if (err) {
      return next(err);
    }
    
    if (!user) {
      return res.status(401).json({ success: false, message: info.message });
    }
    
    // Generate JWT
    const token = generateToken(user);
    
    return res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        avatar: user.avatar
      }
    });
  })(req, res, next);
});

// Google OAuth login
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

// Google OAuth callback
router.get('/google/callback', passport.authenticate('google', { session: false }), (req, res) => {
  // Generate JWT
  const token = generateToken(req.user);
  
  // Redirect to frontend with token
  res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/oauth-callback?token=${token}`);
});

// Facebook OAuth login
router.get('/facebook', passport.authenticate('facebook', { scope: ['email'] }));

// Facebook OAuth callback
router.get('/facebook/callback', passport.authenticate('facebook', { session: false }), (req, res) => {
  // Generate JWT
  const token = generateToken(req.user);
  
  // Redirect to frontend with token
  res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:3000'}/oauth-callback?token=${token}`);
});

// Request password reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(400).json({ success: false, message: 'Email not registered' });
    }
    
    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiry = Date.now() + 3600000; // 1 hour
    
    user.resetToken = resetToken;
    user.resetTokenExpiry = resetTokenExpiry;
    await user.save();
    
    // Send password reset email
    await sendPasswordResetEmail(user.email, resetToken);
    
    res.json({ success: true, message: 'Password reset email sent' });
  } catch (err) {
    logger.error('Password reset request error:', err);
    res.status(500).json({ success: false, message: 'Password reset request failed' });
  }
});

// Reset password
router.post('/reset-password/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    
    const user = await User.findOne({
      resetToken: token,
      resetTokenExpiry: { $gt: Date.now() }
    });
    
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired token' });
    }
    
    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    user.password = hashedPassword;
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;
    await user.save();
    
    res.json({ success: true, message: 'Password reset successful' });
  } catch (err) {
    logger.error('Password reset error:', err);
    res.status(500).json({ success: false, message: 'Password reset failed' });
  }
});

// Get current user
router.get('/me', authenticateJWT, (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email,
      emailVerified: req.user.emailVerified,
      avatar: req.user.avatar,
      createdAt: req.user.createdAt,
      alertSettings: req.user.alertSettings,
      locations: req.user.locations
    }
  });
});

// Logout
router.post('/logout', authenticateJWT, (req, res) => {
  // For JWT, we just tell the client to remove the token
  res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = router;
