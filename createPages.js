const axios = require("axios");
const { wrapper } = require("axios-cookiejar-support");
const tough = require("tough-cookie");

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
      path =
        file.destination.replaceAll(
          "uploads/",
          "https://npediaimg.koogle.sk/"
        ) + file.filename;

      if (i < 10 && i >= 0) paths.push(path);
      if (i < 20 && i >= 10) paths1.push(path);
      if (i < 30 && i >= 20) paths2.push(path);
      if (i < 40 && i >= 30) paths3.push(path);
      if (i >= 40) pathsMore.push(path);
    }
  }
  return { paths, paths1, paths2, paths3, pathsMore };
}

const fetchData = async () => {
  //await login();
  const spreadsheetId = "1pCJqCU54oj1bK06ikXkE2fi6YD83xiqyCERa-Dyo6_c";
  const range = "A1:Z1000";
  const API_KEY = "AIzaSyAGImO-2I0Uk7O3N1edx2IzNkjWWIgbFhU";
  try {
    const response = await axios.get(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?key=${API_KEY}`
    );
    const rows = response.data.values;
    const headers = rows[0];

    const tableData = rows.slice(1).map((row, index) => {
      if (row[27] == "YES") {
        console.log("Creating Page ", index, row[0]);
        //createWikiEventPage(row);
      } else console.log("Skipping row...", index, row[0]);
    });
    console.log(headers);
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
  