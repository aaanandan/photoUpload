const axios = require("axios");
const { wrapper } = require("axios-cookiejar-support");
const tough = require("tough-cookie");
require("dotenv").config();

// Define your MediaWiki API URL and credentials
const apiUrl = "https://nithyanandapedia.org/api.php";
const username = "testkailasa"; // replace with your username
const password = "kenyakailasa"; // replace with your password

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
    console.error("Error during login:", error.message, error);
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
  const pathGrp = getPhotoPaths(photoInfo[15]);
  const eventCategory =
    "events " + getValue(getValue(photoInfo[0])).split("/")[2];
  const kailasaCategory = getValue(photoInfo[7]);
  const eventKailasaCategory = eventCategory + " " + kailasaCategory;
  const EventTypeCategory = getValue(photoInfo[3]);
  const eventNameCategory = getValue(photoInfo[10]);
  const category = getValue(photoInfo[13]);
  let content = `__NOTOC__

  ='''${getValue(photoInfo[4]) || getValue(photoInfo[7])} on  ${getValue(
    photoInfo[11]
  )}'''=
  

  {{
  EventDetails|
  participantsCount=${getValue(photoInfo[16])}|
  eventType=${getValue(photoInfo[3])}|
  foodServedInEvent=|
  mealsCount=|
  volunteersCount=${getValue(photoInfo[20])}|
  eventDuration=
  }}

  =='''Event Description'''==
  
  ${getValue(photoInfo[12])}
  ${getValue(photoInfo[10])
    .split(",")
    .map((e) => {
      "#" + e.toString();
    })} ${"#" + getValue(photoInfo[10])}
  

 =='''Pictures from the day'''==
${pathGrp.paths.toString()}</div>
  </div>
  
  
  <div id="event_pictures">
  <gallery mode=packed-hover heights=200px>
  ${pathGrp.paths1.toString()}
  ${pathGrp.paths2.toString()}
  ${pathGrp.paths3.toString()}
  ${pathGrp.pathsMore.toString()}

  </gallery>
  </div>

[[Category: ${eventCategory}]]
[[Category: ${kailasaCategory}]]
[[Category: ${eventKailasaCategory}]]
[[Category: ${EventTypeCategory}]]
[[Category: ${eventNameCategory}]]
[[Category: ${category}]]

`;

  const title =
    getValue(photoInfo[4]) ||
    getValue(photoInfo[7]) + " On " + getValue(photoInfo[11]);
  await createPage(title, content); // Replace with your page title and content
}

function getPhotoPaths(files) {
  let paths = [];
  let paths1 = [];
  let paths2 = [];
  let paths3 = [];
  let pathsMore = [];
  if (files) {
    files = files.split(",");
    count = files.length;

    for (let i = 0; i < count; i++) {
      const file = files[i];
      const path = file;
      let imgTag = `{{#hsimg:1|200|${path.split("/")[5]}|${path}}}`;
      if (i < 10 && i >= 0) paths.push(imgTag);
      if (i < 20 && i >= 10) paths1.push(imgTag);
      if (i < 30 && i >= 20) paths2.push(imgTag);
      if (i < 40 && i >= 30) paths3.push(imgTag);
      if (i >= 40) pathsMore.push(imgTag);
    }
  }
  return { paths, paths1, paths2, paths3, pathsMore };
}

const fetchData = async () => {
  await login();
  const spreadsheetId = process.env.SPREAD_SHEET_ID;
  const range = process.env.RANGE; //
  const API_KEY = process.env.API_KEY; // "239482"
  try {
    const response = await axios.get(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?key=${API_KEY}`
    );
    const rows = response.data.values;
    const headers = rows[0];

    const tableData = rows.slice(1).map((row, index) => {
      if (row[27] == "YES") {
        console.log("Creating Page ", index, row);
        createWikiEventPage(row);
      } //else console.log("Skipping row...", index, row[0]);
    });
    // console.log(headers);
  } catch (error) {
    console.error("Error fetching data", error);
  } finally {
  }
};

fetchData();

/*
[
    'Timestamp',
    'Email',
    'FilledBy',
    'EntityType',
    'KailasaOrCategory',
    'Country',
    'State',
    'City',
    'Zipcode',
    'EventName',
    'Subtitle',
    'EventDate',
    'EventDescription',
    'Categories',
    'OtherMoreDetails',
    'UploadPictures',
    'NumberOfPeopleAttended',
    'OnlineInPersonEvent',
    'WasFoodServed',
    'HowManyPlatesOfFoodWereServed',
    'HowManyVolunteers',
    'DurationOfTheEvent',
    'BudgetSpent',
    'Aacharya',
    'ChallengesFaced',
    'UploadMorePictures1'
  ]*/
