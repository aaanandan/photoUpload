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
    console.error("Error during login:", error.message);
    exit();
  }
}

// Function to create a page in MediaWiki
async function createPage(pageTitle, pageContent) {
  console.log("Page creation started..");
  let pageCreationStatus = "Started";
  let message = "all good";
  let pageURL = "not generated";

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
      pageCreationStatus = "Done";
      pageURL = createPageResponse.data.edit.title;
      pageURL =
        "https://nithyanandapedia.org/wiki/" + pageURL.replaceAll(" ", "_");
    } else {
      pageCreationStatus = "Failed";
      console.error("Failed to create page, see csv for more details");
    }
  } catch (error) {
    pageCreationStatus = "Error";
    message = error.message;
    console.error("Error during page creation, see csv row for more details");
    return { pageCreationStatus, message };
  }
  return { pageCreationStatus, message, pageURL };
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
  // console.log("photoinfo", photoInfo);
  const pathGrp = getPhotoPaths(photoInfo[15]);
  const photoSection = getPhotoPaths(photoInfo[15]);

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
  
=='''Event Photos'''==
${photoSection.galleryContent}

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

  // console.log("content,userInput ", content, userInputs);
  const aiContent = await rewriteusingAI(content, JSON.stringify(userInputs));
  const response = await createPage(title, aiContent); // Replace with your page title and content
  return response;
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

function getPhotoPaths(files) {
  if (!files) return { galleryContent: "" };

  const fileArray = files.split(",").filter((file) => file.trim());

  // Create gallery section with masonry-style layout
  const gallerySection = `=='''Event Photos'''==
<div class="photo-gallery" style="column-count: 3; column-gap: 5px; padding: 5px;">
${fileArray
  .map(
    (file) => `<div style="break-inside: avoid; margin-bottom: 5px;">
  <img src="${file.trim()}" 
       style="width: 100%; display: block;" 
       onerror="this.style.display='none'" 
       onclick="window.open('${file.trim()}', '_blank')" />
</div>`
  )
  .join("\n")}
</div>`;

  // Add a responsive style block for different screen sizes
  const styleBlock = `
<style>
@media (max-width: 1200px) {
  .photo-gallery { column-count: 2; }
}
@media (max-width: 800px) {
  .photo-gallery { column-count: 1; }
}
</style>`;

  return {
    galleryContent: styleBlock + gallerySection,
  };
}

const fs = require("fs");

const start = async () => {
  console.log("Loging in to wiki...");
  await login();
  const spreadsheetId = process.env.SPREAD_SHEET_ID;
  const range = process.env.RANGE; //
  const API_KEY = process.env.API_KEY; // "239482"

  console.log("Fetching page XL data...");
  try {
    const response = await axios.get(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?key=${API_KEY}`
    );
    // let rows = response.data.values;
    // // console.log("Rows :", rows);
    // const headers = rows[0];
    // // Example data
    let retry = null;

    do {
      //filter rows if this is a retry
      let rows = response.data.values;
      rows = retry == null ? rows : rows.filter((e, i) => retry.includes(i));
      retry = await processRows(rows, retry);
      // console.log("Failed rows  ", retry);
      if (retry.length > 1) {
        console.log(
          "Retrying failed rows. 0 is header row. Press Ctrl+c to stop ",
          retry
        );
      }
    } while (retry.length > 1);

    // if (retry.length > 1) {
    //   console.log("Retrying failed rows, last time..", retry);
    //   retry = await processRows(
    //     rows.filter((e, i) => retry.includes(i), retry)
    //   );
    //   console.log("Rerun for failed rows ", retry);
    // }
  } catch (error) {
    console.error("Error fetching XL page data, Please rerun", error);
    exit();
  } finally {
    console.log("completed run");
  }
};

start();

async function processRows(rows, retry) {
  const headers = ["rownumber", "status", "message", "url"];
  let statusUpdate = null;
  let failedRows = [0];

  for (let i = 1; i < rows.length; i++) {
    let currentRow;
    const row = rows[i];
    if (retry != null) currentRow = retry[i];
    else currentRow = i;
    console.log("Processing Row:", currentRow);

    // Example row processing
    const result = await createWikiEventPage(row);
    // row[28] = result.pageCreationStatus; // Update column AB
    // row[29] = result.message; // Update column AC
    statusUpdate = [
      [currentRow, result.pageCreationStatus, result.message, result.pageURL],
    ];
    appendOrCreateCSV(statusUpdate, headers);
    if (result.pageCreationStatus != "Done") failedRows.push(currentRow);

    // Update the row in Google Sheets
    // const rowRange = `Sheet1!AB${i + 1}:AC${i + 1}`; // Adjust as needed
    // console.log(
    //   "Updating sheet >>" +
    //     `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${rowRange}?valueInputOption=RAW&key=${API_KEY}`
    // );
    // await axios.put(
    //   `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${rowRange}?valueInputOption=RAW&key=${API_KEY}`,
    //   {
    //     // range: rowRange,
    //     values: [[result.pageCreationStatus, result.message]],
    //   } // Wrap row in an array
    // );
    console.log("Status Updated in sheet - row num:", currentRow);
  }

  // console.log("All rows processed and updated.");
  return failedRows;
}

function buildPrompt(pageConent, userInputs) {
  // pageConent =
  //   pageConent ||
  //   "event went very well with more the 40 peoples and 100 online peoples , done annadhan, neivaithyams and abishekamna and alankaram";
  let prompt = `\nInstructions:\n;

Transform the given wiki page fomated content into  polished, professional article, in vaild wiki format,  suitable for publication on Nithyanandapedia. Donot use gallery tag for photos section leave as it is in photos section


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
  // console.log(prompt);
  console.log("Awaiting ai response....");
  return model.generateContent(prompt).then((result) => {
    const response = result.response.text();
    console.log("Received AI modified content.");
    return response;
  });
}

// const fs = require("fs");
const path = require("path");
const { stringify } = require("csv-stringify");
const { exit } = require("process");
const { url } = require("inspector");

// Define the CSV file path
const filePath = path.join(__dirname, `output-${Date.now()}.csv`);

// Function to append or create a CSV file
function appendOrCreateCSV(data, headers = []) {
  // Check if the file exists
  const fileExists = fs.existsSync(filePath);

  // Data to write (add headers only if file doesn't exist)
  const rows = fileExists ? data : [headers, ...data];

  stringify(rows, (err, output) => {
    if (err) {
      console.error("Error generating CSV:", err);
      return;
    }

    // Write to file (append if file exists, otherwise create)
    const writeMethod = fileExists ? fs.appendFile : fs.writeFile;

    writeMethod(filePath, output, (writeErr) => {
      if (writeErr) {
        console.error("Error writing to file:", writeErr);
      } else {
        console.log("CSV file updated successfully!");
      }
    });
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
