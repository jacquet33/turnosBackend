const express  = require('express');
const router   = express.Router();
const authCtrl     = require('../controllers/auth.controller');
const servicesCtrl = require('../controllers/services.controller');
const scheduleCtrl = require('../controllers/schedule.controller');
const bookingsCtrl = require('../controllers/bookings.controller');
const { authenticate } = require('../middlewares/auth');

router.post('/auth/register', authCtrl.register);
router.post('/auth/login',    authCtrl.login);
router.get ('/auth/me',       authenticate, authCtrl.me);

router.get   ('/services',     authenticate, servicesCtrl.list);
router.post  ('/services',     authenticate, servicesCtrl.create);
router.put   ('/services/:id', authenticate, servicesCtrl.update);
router.delete('/services/:id', authenticate, servicesCtrl.remove);

router.get('/services/:id/schedule', authenticate, scheduleCtrl.getSchedule);
router.put('/services/:id/schedule', authenticate, scheduleCtrl.saveSchedule);

router.get ('/book/:linkId', bookingsCtrl.getBookingPage);
router.post('/book/:linkId', bookingsCtrl.createBooking);

router.get  ('/bookings',            authenticate, bookingsCtrl.listBookings);
router.patch('/bookings/:id/status', authenticate, bookingsCtrl.updateStatus);
router.get  ('/clients',             authenticate, bookingsCtrl.listClients);

module.exports = router;
