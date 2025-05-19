// config/passport.js
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const LocalStrategy = require('passport-local').Strategy;
const JwtStrategy = require('passport-jwt').Strategy;
const ExtractJwt = require('passport-jwt').ExtractJwt;
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const logger = require('../utils/logger');

// Serialize and deserialize user
passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});

module.exports = function(passport) {
  // JWT Strategy for API authentication
  const jwtOptions = {
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: process.env.JWT_SECRET || 'your-jwt-secret'
  };

  passport.use(
    new JwtStrategy(jwtOptions, async (jwt_payload, done) => {
      try {
        const user = await User.findById(jwt_payload.id);
        if (user) {
          return done(null, user);
        }
        return done(null, false);
      } catch (err) {
        logger.error('JWT strategy error:', err);
        return done(err, false);
      }
    })
  );

  // Local Strategy for email/password login
  passport.use(
    new LocalStrategy(
      {
        usernameField: 'email',
        passwordField: 'password'
      },
      async (email, password, done) => {
        try {
          // Find the user
          const user = await User.findOne({ email });
          if (!user) {
            return done(null, false, { message: 'Email not registered' });
          }

          // Verify password
          const isMatch = await bcrypt.compare(password, user.password);
          if (!isMatch) {
            return done(null, false, { message: 'Invalid password' });
          }

          // Record login timestamp
          user.lastLogin = Date.now();
          await user.save();

          return done(null, user);
        } catch (err) {
          logger.error('Local strategy error:', err);
          return done(err, false);
        }
      }
    )
  );

  // Google OAuth Strategy
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: '/api/auth/google/callback',
        proxy: true
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Check if user already exists
          let user = await User.findOne({ googleId: profile.id });

          if (user) {
            // Update user info if needed
            user.lastLogin = Date.now();
            await user.save();
            return done(null, user);
          }

          // Check if email already exists
          if (profile.emails && profile.emails.length > 0) {
            const existingUser = await User.findOne({ email: profile.emails[0].value });
            if (existingUser) {
              // Link Google account to existing user
              existingUser.googleId = profile.id;
              existingUser.lastLogin = Date.now();
              await existingUser.save();
              return done(null, existingUser);
            }
          }

          // Create new user
          const newUser = new User({
            googleId: profile.id,
            name: profile.displayName,
            email: profile.emails && profile.emails.length > 0 ? profile.emails[0].value : '',
            avatar: profile.photos && profile.photos.length > 0 ? profile.photos[0].value : '',
            accountType: 'google',
            emailVerified: true // Google already verifies email
          });

          await newUser.save();
          return done(null, newUser);
        } catch (err) {
          logger.error('Google strategy error:', err);
          return done(err, false);
        }
      }
    )
  );

  // Facebook OAuth Strategy
  passport.use(
    new FacebookStrategy(
      {
        clientID: process.env.FACEBOOK_APP_ID,
        clientSecret: process.env.FACEBOOK_APP_SECRET,
        callbackURL: '/api/auth/facebook/callback',
        profileFields: ['id', 'displayName', 'photos', 'email'],
        proxy: true
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          // Check if user already exists
          let user = await User.findOne({ facebookId: profile.id });

          if (user) {
            // Update user info if needed
            user.lastLogin = Date.now();
            await user.save();
            return done(null, user);
          }

          // Check if email already exists
          if (profile.emails && profile.emails.length > 0) {
            const existingUser = await User.findOne({ email: profile.emails[0].value });
            if (existingUser) {
              // Link Facebook account to existing user
              existingUser.facebookId = profile.id;
              existingUser.lastLogin = Date.now();
              await existingUser.save();
              return done(null, existingUser);
            }
          }

          // Create new user
          const newUser = new User({
            facebookId: profile.id,
            name: profile.displayName,
            email: profile.emails && profile.emails.length > 0 ? profile.emails[0].value : '',
            avatar: profile.photos && profile.photos.length > 0 ? profile.photos[0].value : '',
            accountType: 'facebook',
            emailVerified: true // Facebook already verifies email
          });

          await newUser.save();
          return done(null, newUser);
        } catch (err) {
          logger.error('Facebook strategy error:', err);
          return done(err, false);
        }
      }
    )
  );
};
