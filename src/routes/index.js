const express  = require('express');
const router   = express.Router();

const authCtrl     = require('../controllers/auth.controller');
const servicesCtrl = require('../controllers/services.controller');
const scheduleCtrl = require('../controllers/schedule.controller');
const bookingsCtrl = require('../controllers/bookings.controller');
const mpCtrl       = require('../controllers/mercadopago.controller');

const { authenticate }                       = require('../middlewares/auth');
const { checkSubscription, checkServiceLimit } = require('../middlewares/subscription');
const contactCtrl = require('../controllers/contact.controller');
const exploreCtrl = require('../controllers/explore.controller');


// ── Auth ──────────────────────────────────────────────────────────────────
router.post('/auth/register', authCtrl.register);
router.post('/auth/login',    authCtrl.login);
router.get ('/auth/me',       authenticate, authCtrl.me);
router.post('/auth/google',  authCtrl.googleAuth);

// ── Suscripción ───────────────────────────────────────────────────────────
router.get ('/subscription/status',            authenticate, mpCtrl.getStatus);
router.post('/subscription/create-preference', authenticate, mpCtrl.createPreference);
router.post('/subscription/cancel',            authenticate, mpCtrl.cancelSubscription);
router.post('/subscription/webhook',           mpCtrl.webhook); // sin auth, lo llama MP

// ── Servicios (requieren suscripción activa) ──────────────────────────────
router.get   ('/services',     authenticate, checkSubscription, servicesCtrl.list);
router.post  ('/services',     authenticate, checkSubscription, checkServiceLimit, servicesCtrl.create);
router.put   ('/services/:id', authenticate, checkSubscription, servicesCtrl.update);
router.delete('/services/:id', authenticate, checkSubscription, servicesCtrl.remove);

// ── Horarios ──────────────────────────────────────────────────────────────
router.get('/services/:id/schedule', authenticate, checkSubscription, scheduleCtrl.getSchedule);
router.put('/services/:id/schedule', authenticate, checkSubscription, scheduleCtrl.saveSchedule);

// ── Booking público (sin auth, sin suscripción) ───────────────────────────
router.get ('/book/:linkId', bookingsCtrl.getBookingPage);
router.post('/book/:linkId', bookingsCtrl.createBooking);

// ── Agenda y clientes (requieren suscripción) ─────────────────────────────
router.get   ('/bookings',            authenticate, checkSubscription, bookingsCtrl.listBookings);
router.post  ('/bookings',            authenticate, checkSubscription, bookingsCtrl.createBookingAdmin);
router.put   ('/bookings/:id',        authenticate, checkSubscription, bookingsCtrl.updateBooking);
router.patch ('/bookings/:id/status', authenticate, checkSubscription, bookingsCtrl.updateStatus);
router.delete('/bookings/:id',        authenticate, checkSubscription, bookingsCtrl.deleteBooking);
router.get   ('/clients',             authenticate, checkSubscription, bookingsCtrl.listClients);

router.post('/contact', contactCtrl.sendContact);

// ── Directorio público para la app (modo cliente, sin auth) ───────────────
router.get('/explore',                     exploreCtrl.search);
router.get('/explore/categories',          exploreCtrl.categories);
router.get('/explore/cities',              exploreCtrl.cities);
router.get('/explore/reverse',             exploreCtrl.reverse);
router.get('/explore/business/:publicId',  exploreCtrl.business);

// ── Perfil público del negocio (dueño logueado) ───────────────────────────
router.get('/profile', authenticate, exploreCtrl.getProfile);
router.put('/profile', authenticate, exploreCtrl.updateProfile);

module.exports = router;
