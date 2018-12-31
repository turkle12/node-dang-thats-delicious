const passport = require('passport');
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = mongoose.model('User');
const promisify = require('es6-promisify');
const mail = require('../handlers/mail');

exports.login = passport.authenticate('local', {
    failureRedirect: '/login',
    failureFlash: 'Login failed',
    successRedirect: '/',
    successFlash: 'Successfully logged in'
});

exports.logout = (req, res) => {
    req.logout();
    req.flash('success', 'Logged out');
    res.redirect('/');
}

exports.isLoggedIn = (req, res, next) => {
    if(req.isAuthenticated()) {
        next();
        return;
    } 
    req.flash('error', 'You need to be logged in to do that');
    req.redirect('/login');
}

exports.forgot = async (req, res) => {
    // Check user with email exists
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
        req.flash('error', 'No account with that email');
        return res.redirect('/login');
    }
    // Set reset tokens on their account
    user.resetPasswordToken = crypto.randomBytes(20).toString('hex');
    user.resetPasswordExpires = Date.now() + 3600000 // 1 hour from now
    await user.save();
    // Send email with token
    const resetURL = `http://${req.headers.host}/account/reset/${user.resetPasswordToken}`;
    await mail.send({
        user,
        subject: 'Password reset',
        resetURL,
        filename: 'password-reset'
    })
    req.flash('success', `You've been emailed a password reset link.`);
    // redirect to login page after email has been sent
    res.redirect('/login');
}

exports.reset = async (req, res) => {
    const user = await User.findOne({
        resetPasswordToken: req.params.token,
        resetPasswordExpires: { $gt: Date.now() }
    });
    if (!user) {
        req.flash('error', 'Reset token invalid or expired');
        res.redirect('/login');
    }
    // If there is user show reset password form
    res.render('reset', { title: 'Reset your password' });
}

exports.confirmPasswords = (req, res, next) => {
    if (req.body.password === req.body['confirm-password']) {
        next();
        return;
    }
    req.flash('error', 'Passwords don\'t match');
    res.redirect('back');
};

exports.update = async (req, res) => {
    const user = await User.findOne({
        resetPasswordToken: req.params.token,
        resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
        req.flash('error', 'Reset token invalid or expired');
        res.redirect('/login');
    }

    const setPassword = promisify(user.setPassword, user);
    await setPassword(req.body.password);
    user.resetPasswordToken = undefined; // by setting to undefined the fields will be removed from the db
    user.resetPasswordExpires = undefined; // by setting to undefined the fields will be removed from the db
    const updatedUser = await user.save();
    await req.login(updatedUser);
    req.flash('success', 'Password updated');
    res.redirect('/');
};