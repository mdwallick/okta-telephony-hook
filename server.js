// server.js
// where your node app starts

const express = require("express");
const app = express();

// listen for requests :)
const listener = app.listen(process.env.PORT, () => {
    console.log("Your app is listening on port " + listener.address().port);
});

// authorization constants
const bodyParser = require("body-parser");
const basicAuth = require("express-basic-auth");

// basic authorization and parsing
app.use(bodyParser.json());
app.use(
    basicAuth({
        users: { admin: process.env.API_KEY },
        unauthorizedResponse: (req) => "Unauthorized",
    })
);

//****************************
// added code for Telephony Inline hook
var accountSid = process.env.ACCOUNT_SID; // Your Account SID from www.twilio.com/console
var authToken = process.env.AUTH_TOKEN; // Your Auth Token from www.twilio.com/console

// Retrieves the sender/from phone number
var from = process.env.FROM_PHONE_NUMBER;

const client = require("twilio")(accountSid, authToken, {
    lazyLoading: true,
});

// Telephony Inline Hook code to parse the incoming Okta request
app.post("/telephonyHook", (request, response) => {
    // Prints to console log the name of the user signing in and requesting OTP
    console.log(" ");
    console.log(
        "Processing OTP delivery for " +
        request.body.data.userProfile["firstName"] +
        " " +
        request.body.data.userProfile["lastName"] +
        " " +
        request.body.data.userProfile["login"]
    );

    // Saves phone number for the user requesting OTP in the variable userPhoneNumber and prints it to the console log
    var userPhoneNumber = request.body.data.messageProfile["phoneNumber"];

    // Saves OTP code from Okta to send to user via SMS provider
    var userOtpCode = request.body.data.messageProfile["otpCode"];

    // Uses userPhoneNumber and userOTP variables to send to third-party telephony provider
    if (request.body.data.messageProfile["deliveryChannel"].toLowerCase() === "sms") {
        console.log("Sending SMS ...");
        sendSms(from, userPhoneNumber, userOtpCode, response);
    } else {
        console.log("Making CALL ...");
        makeCall(from, userPhoneNumber, userOtpCode, response);
    }
});

// code to send back to Okta based on the result of the SMS/Call
function sendSms(from, userPhoneNumber, userOtpCode, response) {
    client.messages
        .create({
            body: "Twilio: Your OTP is " + userOtpCode,
            to: userPhoneNumber,
            from: from,
        })
        .then((message) => {
            response.status(200).json(getSuccessResponse("SMS", message.sid));
        })
        .catch((error) => {
            response.status(400).json(getErrorResponse("SMS", error));
        });
}

function makeCall(from, to, otp, response) {
    // Add space to OTP digits for correct pronunciation
    otp = otp.replace(/\B(?=(\d{1})+(?!\d))/g, " ");
    const url = encodeURI(process.env.TWIML_URL + otp);

    client.calls
        .create({ to, from, url })
        .then((call) => {
            response.status(200).json(getSuccessResponse("VOICE", call.sid));
        })
        .catch((error) => {
            response.status(400).json(getErrorResponse("VOICE", error));
        });
}

// Returns the success response in telephony hook's expected API contract
function getSuccessResponse(method, sid) {
    console.log("Successfully sent " + method + " : " + sid);
    const actionKey = "com.okta.telephony.action";
    const actionVal = "SUCCESSFUL";
    const providerName = "TWILIO";
    const resp = {
        commands: [{
            type: actionKey,
            value: [{
                status: actionVal,
                provider: providerName,
                transactionId: sid,
            }, ],
        }, ],
    };
    return resp;
}

// Returns the error response in telephony hook's expected API contract
function getErrorResponse(method, error) {
    console.log("Error in " + method + " : " + error);
    const errorResp = {
        error: {
            errorSummary: error.message,
            errorCauses: [{
                errorSummary: error.status,
                reason: error.moreInfo,
                location: error.detail,
            }, ],
        },
    };
    return errorResp;
}