const axios = require("axios");
const { wrapper } = require("axios-cookiejar-support");
const tough = require("tough-cookie");
require("dotenv").config();

const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

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

  let userInputs = {
    Timestamp: photoInfo[0],
    Email: photoInfo[1],
    FilledBy: photoInfo[2],
    EntityType: photoInfo[3],
    KailasaOrCategory: photoInfo[4],
    Country: photoInfo[5],
    State: photoInfo[6],
    City: photoInfo[7],
    Zipcode: photoInfo[8],
    EventName: photoInfo[9],
    Subtitle: photoInfo[10],
    EventDate: photoInfo[11],
    EventDescription: photoInfo[12],
    Categories: photoInfo[13],
    OtherMoreDetails: photoInfo[14],
    UploadPictures: photoInfo[15],
    NumberOfPeopleAttended: photoInfo[16],
    OnlineInPersonEvent: photoInfo[17],
    WasFoodServed: photoInfo[18],
    HowManyPlatesOfFoodWereServed: photoInfo[19],
    HowManyVolunteers: photoInfo[20],
    DurationOfTheEvent: photoInfo[21],
    BudgetSpent: photoInfo[22],
    Aacharya: photoInfo[23],
    ChallengesFaced: photoInfo[24],
    UploadMorePictures1: photoInfo[25],
  };

  const aiContent = await rewriteusingAI(content, JSON.stringify(userInputs));
  console.log("wating for AI content....", aiContent);
  await createPage(title, aiContent); // Replace with your page title and content
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
  console.log("Loging in to wiki...");
  await login();
  const spreadsheetId = process.env.SPREAD_SHEET_ID;
  const range = process.env.RANGE; //
  const API_KEY = process.env.API_KEY; // "239482"
  console.log("fetching XL data...");
  try {
    const response = await axios.get(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?key=${API_KEY}`
    );
    const rows = response.data.values;
    const headers = rows[0];

    // const tableData = rows.slice(1).map((row, index) => {
    // if (row[27] == "YES") {
    // console.log("Creating Page ", index, row);
    createWikiEventPage(rows[1]);
    // } //else console.log("Skipping row...", index, row[0]);
    // });
    // console.log(headers);
  } catch (error) {
    console.error("Error fetching data", error);
  } finally {
  }
};

fetchData();

function buildPrompt(pageConent, userInputs) {
  // pageConent =
  //   pageConent ||
  //   "event went very well with more the 40 peoples and 100 online peoples , done annadhan, neivaithyams and abishekamna and alankaram";
  let prompt = `\nInstructions:\n;

Transform the given wiki page fomated content into  polished, professional article, in vaild wiki format,  suitable for publication on Nithyanandapedia.

General Requirements:
1. Language & Style:
   - Use formal, professional language
   - Ensure proper grammar and punctuation
   - Maintain active voice where appropriate
   - Use clear, concise sentences
   - Avoid colloquial expressions

2. Structure & Format:
   - Organize content in logical paragraphs
   - Use consistent formatting
   - Include appropriate section headings if needed
   - Maintain proper spacing and alignment

3. Content Quality:
   - Remove redundant words and phrases
   - Add relevant context where necessary
   - Include only factual, verifiable information
   - Ensure terminology consistency
   - Preserve all proper nouns and titles exactly as written

4. Spiritual Context:
   - Maintain respectful tone
   - Include the standard blessing line: "With blessings of Supreme Pontiff of Hinduism Bhagawan Sri Nithyananda Paramashivam"
   - Preserve the spiritual significance of the content
   - Use correct spiritual terminology

5. Technical Aspects:
   - Follow encyclopedia writing style
   - Add appropriate references where needed
   - Maintain consistent date formats
   - Use proper capitalization for sacred terms

Original content: ${pageConent}

Additional specific requirements for this content (if any):
      Add specific requirements related to the particular content being transformed, below information is colleted from user to generate the given orginal
      you can use any information below mkae the wiki page content informative. 
Addtion information:    ${userInputs}`;
  return prompt;
}

function rewriteusingAI(pageConent, userInputs) {
  const prompt = buildPrompt(pageConent, userInputs);
  console.log(prompt);
  console.log("awaiting ai response....");
  return model.generateContent(prompt).then((result) => {
    const response = result.response.text();
    console.log(response);
    return response;
  });
}

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
