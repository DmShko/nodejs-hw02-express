const Joi = require("joi");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const gravatar = require("gravatar");
const nodemailer = require("nodemailer");
const path = require("path");
const {nanoid} = require("nanoid");

const { HttpError, ctrlWrapper, sendEmail } = require("../helpers");

const { SECRET_KEY, BASE_URL, GOOGLE_PASSWORD } = process.env;

const User = require("../models/user");

const checkRegister = Joi.object({

    email: Joi.string().pattern(/\w{0}[a-zA-Zа-яА-Я]+\d{0}[0-9]+\@\w{0}[a-zA-Zа-яА-Я]+\.\w{0}[a-zA-Zа-яА-Я]/).required(),
    password: Joi.string().min(8).required(),
    subscription: Joi.string().valid("starter", "pro", "business"),

});

const checkShemaSubscription = Joi.object({
    subscription: Joi.boolean().valid("starter", "pro", "business").required(),
});

const emailShema = Joi.object({
    email: Joi.string().pattern(/\w{0}[a-zA-Zа-яА-Я]+\d{0}[0-9]+\@\w{0}[a-zA-Zа-яА-Я]+\.\w{0}[a-zA-Zа-яА-Я]/).required(),
});

const checkLogin = Joi.object({

    email: Joi.string().pattern(/\w{0}[a-zA-Zа-яА-Я]+\d{0}[0-9]+\@\w{0}[a-zA-Zа-яА-Я]+\.\w{0}[a-zA-Zа-яА-Я]/).required(),
    password: Joi.string().min(8).required(),

});

const register = async (req, res) => {
    
    const { body } = req;
    const { email, password } = req.body;
    const { error } = checkRegister.validate(body);

    // for create unique 409 message
    const user = await User.findOne({email});

    if(user) throw HttpError(409, "Email in use");

    // ather error message
    if (error) {
    throw HttpError(
        400,
        'Joi validation error'
        );
    }

    // get url for temp user avatar
    const avatarURL = gravatar.url(email);

    // hash password
    const hashPassword = await bcrypt.hash(password, 10);

    // verify code from email
    const verificationCode = nanoid();
  
    const newUser = await User.create({...body, password: hashPassword, avatarURL, verificationCode});

    /***************for send grid**************** */
    // const verifyEmail = {
    //     to: email,
    //     subject: "Verify email",
    //     html: `<a target="_blank" href="${BASE_URL}/api/auth/verify/${verificationCode}">Click verify email</a>`,
    // };

    // await sendEmail(verifyEmail);

    /*******************for nodemailer*********** */

    // configuration
    const nodemailerConfig = {
        service: "Gmail",
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: {
            user: 'dmitry.schevchenko.work@gmail.com',
            pass: GOOGLE_PASSWORD,
        },
    };

    // create transporter object
    const transporter = nodemailer.createTransport(nodemailerConfig);

    const verifyEmail = {
        to: email,
        from: 'dmitry.schevchenko.work@gmail.com',
        subject: "Verify email",
        html: `<a target="_blank" href="${BASE_URL}/api/auth/verify/${verificationCode}">Click verify email</a>`,
    };

    transporter.sendMail(verifyEmail).then(() => 
        console.log('Email send successfuly')
    )
    .catch( error =>
        console.log(error.message)
    );
    /*******************for nodemailer end*********** */

    res.status(201).json({
        user:{
            email: newUser.email,
            subscription: newUser.subscription
        }
    });
   
};

const verifyEmail = async (req, res) => {

    const { verificationCode } = req.params;
    const user = await User.findOne({verificationCode});

    // find user whith souch verication code
    // if not found
    if(!user) throw HttpError(401, "Email not found");

    // if found, change verify true
    await User.findByIdAndUpdate(user._id, {verify: true, verificationCode: ""});

    res.json({
        message: "Email verify success"
    });
};

const resendVerifyEmail = async (req, res) => {
    const { body } = req;
    const { email } = req.body;
    const { error } = emailShema.validate(body);

    // ather error message (from frontend)
    if (error) {
        throw HttpError(
            400,
            'Joi validation error'
        );
    }

    const user = await User.findOne({email});

    if(!user) throw HttpError(401, "Email not found");

    if(user.verify) throw HttpError(401, "User already verified");

    const verifyEmail = {
        to: email,
        subject: "Verify email",
        html: `<a target="_blank" href="${BASE_URL}/api/auth/verify/${user.verificationCode}">Click verify email</a>`,
    };

    await sendEmail(verifyEmail);

    res.json({
        message: "Email verify success"
    });
};

const login = async (req, res) => {

    const { body } = req;
    const { email, password } = req.body;
    const { error } = checkLogin.validate(body);

    // ather error message (from frontend)
    if (error) {
        throw HttpError(
            400,
            'Joi validation error'
        );
    }

    // check email that user with sach email use (on DB resource) return user {...} if he exist.
    const user = await User.findOne({email});

    if(!user) throw HttpError(401, "Email or password wrong");

    if(!user.verify) throw HttpError(401, "Email isn't verified");

    // check email that enter password invalid
    const passwordCompare = await bcrypt.compare(password, user.password);

    if(!passwordCompare) throw HttpError(401, "Email or password wrong");

    // create token
    const payload = {
        id: user._id,
    };

    const token = jwt.sign(payload, SECRET_KEY, {expiresIn: '23h'});

    await User.findByIdAndUpdate(user._id,{token});

    res.status(200).json({
        token,
    });
};


const getCurrent = (req, res) => {

    const { email, subscription } = req.user;
  
    res.status(200).json({
        email: email,
        subscription: subscription,
    });
  
};

const logout = async(req, res) => {

    const { _id } = req.user;
    
    await User.findByIdAndUpdate(_id, {token: ""});
  
    res.status(204).json({
        message: "No Content",
    });
  
};

const updateSubscriptionUser = async (req, res) => {
   
    const { _id } = req.user;
    const { body } = req;
    const { error } = checkShemaSubscription.validate(body);
    

    if (error) {
      throw HttpError(
        400,
        `missing ${error.message
          .split(" ")
          .filter(
            (value) =>
              value !== "is" && value !== "required" && value !== "field"
          )} field`
      );
    }
  
    // Replace the value of the "favorite" ($set operator) field or add it if it does not exist
    const result = await User.updateOne({_id: _id},{$set:{subscription: body.subscription}});
  
    if (result === null) {
      throw HttpError(404, "Not found");
    }
    res.status(200).json(await User.findById(_id));
  
}

module.exports = {
    register: ctrlWrapper(register),
    login: ctrlWrapper(login),
    logout: ctrlWrapper(logout),
    getCurrent: ctrlWrapper(getCurrent),
    updateSubscriptionUser: ctrlWrapper(updateSubscriptionUser),
    verifyEmail: ctrlWrapper(verifyEmail),
    resendVerifyEmail: ctrlWrapper(resendVerifyEmail),
};