const express = require("express");
const multer = require("multer");
const app = express();
const port = 3000;
var slugify = require("slugify");
const makeDir = require("make-dir");
const fs = require("fs");
const filepath = require("path");
// var cors = require('cors');
// app.use(cors());
const { GoogleSpreadsheet } = require("google-spreadsheet");
const { JWT } = require("google-auth-library");
require("dotenv").config();

app.use(express.static("uploads"));

function getMutlerConfig() {
  // path exists unless there was an error
  return multer.diskStorage({
    destination: (req, file, cb) => {
      const folder = getFolderName(req);
      console.log("photo(s) uploded to folder :", folder);
      (async () => {
        const path = await makeDir(folder);
        console.log(path);
        cb(null, folder);
        //=> '/Users/sindresorhus/fun/unicorn/rainbow/cake'
      })();
    },
    filename: (req, file, cb) => {
      // Define how the uploaded files should be named
      cb(null, Date.now() + "-" + file.originalname);
    },
  });
}

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Define the directory where uploaded files will be stored
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    // Define how the uploaded files should be named
    cb(null, Date.now() + "-" + file.originalname);
  },
});

app.use(express.static(filepath.join(__dirname, "build")));

app.get("/", function (req, res) {
  res.sendFile(filepath.join(__dirname, "build", "index.html"));
});

// const upload = multer({ storage: storage });
// Middleware to handle file uploads

app.post(
  "/upload",
  multer({ storage: getMutlerConfig() }).array("files", 200),
  (req, res) => {
    // Access uploaded files via req.files
    if (!req.files || req.files.length === 0) {
      return res.status(400).send({ message: "No files found", ...req.body });
    }
    const folder = getFolderName(req);
    const photoInfo = {
      ...req.body,
      files: req.files,
      folder,
      timestamp: Date.now(),
    };
    fs.appendFile(
      "uploads/files.json",
      JSON.stringify(photoInfo),
      function (err) {
        if (err) throw err;
        console.log("/uploads/files.json updated.");
      }
    );

    const { MongoClient } = require("mongodb");
    async function updateToDB() {
    const uri = "mongodb://mongo:27017/";
    const client = new MongoClient(uri);
      try {
        console.log("updating to DB");
        await client.connect();
        await addRecord(client, photoInfo);
        await updateSheet(photoInfo);
        const pathGrp = getPhotoPaths(photoInfo.files);
      } finally {
        await client.close();
      }
    }
    updateToDB().catch(console.error);
    async function addRecord(client, photoInfo) {
      const result = await client
        .db("photos")
        .collection("photos")
        .insertOne(photoInfo);

      //await createWikiEventPage(photoInfo);
      console.log(`New record added: ${result.insertedId}`);
          return res.status(200).send({ message: "files uploaded sucessfully to :" + folder });
  }
    }
);

app.listen(port, () => {
  console.log(`server  is running on port ${port}`);
});
function getFolderName(req) {
  // console.log('req',req, JSON.stringify(req.body));
  return `uploads/${
    slugify(
      req.body.startDate.toString().substring(0, 25).replaceAll(":", ".")
    ) +
    "-" +
    slugify(req.body.place.toString())
  }/${slugify(req.body.place.toString())}/`;
}

async function updateSheet(photoInfo) {
  // Initialize auth - see https://theoephraim.github.io/node-google-spreadsheet/#/guides/authentication

  const service_account_email = process.env.SERVICE_ACCOUNT_EMAIL;
  const service_account_key = process.env.SERVICE_ACCOUNT_KEY.replace(/\\n/g, '\n');

  const serviceAccountAuth = new JWT({
    // env var values here are copied from service account credentials generated by google
    // see "Authentication" section in docs for more info
    email: service_account_email,
    key: service_account_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  const doc = new GoogleSpreadsheet(
    process.env.SPREAD_SHEET_ID,
    serviceAccountAuth
  );
  await doc.loadInfo(); // loads document properties and worksheets
  // console.log(doc.title);
  const sheet = doc.sheetsByIndex[0]; // or use `doc.sheetsById[id]` or `doc.sheetsByTitle[title]`

  const pathGrp = getPhotoPaths(photoInfo.files);
  // console.log(photoInfo);

  let row = {
    Timestamp: new Date(photoInfo.timestamp).toLocaleDateString("en-IN"),
    Email: photoInfo.email,
    FilledBy: "",
    EntityType: photoInfo.eventType,
    KailasaOrCategory: photoInfo.place,
    Country: "",
    State: "",
    City: photoInfo.place,
    Zipcode: "",
    EventName: photoInfo.eventName,
    Subtitle: photoInfo.activityType,
    EventDate: new Date(photoInfo.startDate).toLocaleDateString("en-IN"),
    EventDescription:
      photoInfo.description + ", " + photoInfo.presidentialBriefing,
    Categories: photoInfo.activityType,
    OtherMoreDetails: "",
    UploadPictures: pathGrp.paths.toString(),
    NumberOfPeopleAttended: photoInfo.livesEnriched,
    OnlineInPersonEvent: "",
    WasFoodServed: "",
    HowManyPlatesOfFoodWereServed: "",
    HowManyVolunteers: photoInfo.volunteerCount,
    DurationOfTheEvent: "",
    BudgetSpent: "",
    Aacharya: "",
    ChallengesFaced: "",
    UploadMorePictures1: pathGrp.paths1.toString(),
    UploadMorePictures2: pathGrp.paths2.toString(),
    UploadMorePictures3: pathGrp.paths3.toString(),
    UploadMorePictures4: pathGrp.pathsMore.toString(),
    UploadPDB: "",
    NumberOfNaivedhyamOffered: "",
  };

  const newRow = await sheet.addRow(row);
  console.log("added a row to XL sheet");
}

function getPhotoPaths(files) {
  let paths = [];
  let paths1 = [];
  let paths2 = [];
  let paths3 = [];
  let pathsMore = [];
  if (files) {
    count = files.length;
    for (let i = 0; i < count; i++) {
      const file = files[i];
      const domain = process.env.DOMAIN + "/";
      path = file.destination.replaceAll("uploads/", domain) + file.filename;

      if (i < 10 && i >= 0) paths.push(path);
      if (i < 20 && i >= 10) paths1.push(path);
      if (i < 30 && i >= 20) paths2.push(path);
      if (i < 40 && i >= 30) paths3.push(path);
      if (i >= 40) pathsMore.push(path);
    }
  }
  return { paths, paths1, paths2, paths3, pathsMore };
}

const axios = require("axios");
const { wrapper } = require("axios-cookiejar-support");
const tough = require("tough-cookie");

// Define your MediaWiki API URL and credentials
const apiUrl = "https://nithyanandapedia.org/api.php";
const username = process.env.WIKI_UESRNAME; // replace with your username
const password = process.env.WIKI_PASSWORD; // replace with your password

// Create a cookie jar to store cookies
const cookieJar = new tough.CookieJar();

// Wrap axios with cookie jar support
const api = wrapper(
  axios.create({
    baseURL: apiUrl,
    withCredentials: true,
    jar: cookieJar, // Set the cookie jar
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  })
);

// Function to login to MediaWiki
async function login() {
  try {
    // Step 1: Fetch the login token
    const loginTokenResponse = await api.get("", {
      params: {
        action: "query",
        meta: "tokens",
        type: "login",
        format: "json",
      },
    });

    const loginToken = loginTokenResponse.data.query.tokens.logintoken;

    // Step 2: Log in using the login token
    const loginResponse = await api.post(
      "",
      new URLSearchParams({
        action: "login",
        lgname: username,
        lgpassword: password,
        lgtoken: loginToken,
        format: "json",
      })
    );

    if (loginResponse.data.login.result !== "Success") {
      throw new Error("Login failed: " + loginResponse.data.login.reason);
    }

    console.log("Login successful!");
  } catch (error) {
    console.error("Error during login:", error.message);
  }
}

// Function to create a page in MediaWiki
async function createPage(pageTitle, pageContent) {
  try {
    // Step 3: Get a CSRF token
    const csrfTokenResponse = await api.get("", {
      params: {
        action: "query",
        meta: "tokens",
        format: "json",
      },
    });

    const csrfToken = csrfTokenResponse.data.query.tokens.csrftoken;

    // Step 4: Use the CSRF token to create a page
    const createPageResponse = await api.post(
      "",
      new URLSearchParams({
        action: "edit",
        title: pageTitle,
        text: pageContent,
        token: csrfToken,
        format: "json",
      })
    );

    if (
      createPageResponse.data.edit &&
      createPageResponse.data.edit.result === "Success"
    ) {
      console.log("Page created successfully!");
    } else {
      console.error("Failed to create page:", createPageResponse.data);
    }
  } catch (error) {
    console.error("Error during page creation:", error.message);
  }
}

function getValue(input) {
  if (input === "null") return "";
  else if (input === "undefined") return "";
  else if (input === "") return "";
  else if (input === null) return "";
  else if (input === undefined) return "";
  else return input;
}
// Execute the login and page creation
async function createWikiEventPage(photoInfo) {
  const pathGrp = getPhotoPaths(photoInfo.files);

  await login();

  let content = `__NOTOC__

  ='''${getValue(photoInfo.place)} on  ${getValue(photoInfo.startDate)}'''=
  
  ==''${getValue(photoInfo.activityType)}''==
  {{
  EventDetails|
  participantsCount=${getValue(photoInfo.livesEnriched)}|
  eventType=${getValue(photoInfo.eventType)}|
  foodServedInEvent=|
  mealsCount=|
  volunteersCount=${getValue(photoInfo.volunteerCount)}|
  eventDuration=
  }}
  
  ${getValue(photoInfo.description)}
  ${getValue(photoInfo.activityType)
    .split(",")
    .map((e) => {
      "#" + e.toString();
    })} ${"#" + getValue(photoInfo.eventType)}
  
  =='''Presidential Daily Briefing'''==

  ${pathGrp.paths.toString()}</div>
  </div>
  
  =='''Pictures from the day'''==
  
  <div id="event_pictures">
  <gallery mode=packed-hover heights=200px>
  ${pathGrp.paths1.toString()}
  ${pathGrp.paths2.toString()}
  ${pathGrp.paths3.toString()}
  ${pathGrp.pathsMore.toString()}
  </gallery>
  </div>
  
  ${getValue(photoInfo.activityType)
    .split(",")
    .map((e) => {
      "[[Category:" + e + "]]";
    })}
  `;

  const title =
    getValue(photoInfo.place) + " On " + getValue(photoInfo.startDate);
  await createPage(title, content); // Replace with your page title and content
}
