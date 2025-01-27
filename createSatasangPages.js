const fs = require("fs");
const axios = require("axios");
const { wrapper } = require("axios-cookiejar-support");
const tough = require("tough-cookie");
require("dotenv").config();
const path = require("path");
const { stringify } = require("csv-stringify");
const { exit } = require("process");
const { url } = require("inspector");
const { marked } = require("marked");

const { GoogleGenerativeAI } = require("@google/generative-ai");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-flash",
  max_output_tokens: 4096,
});

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

// Conversion function
function getWikiText(html = "") {
  // const html = CKEDITOR.instances.editor.getData();

  // Helper function to handle nested lists
  function handleNestedLists(html, listType) {
    const prefix = listType === "ul" ? "*" : "#";
    return html.replace(
      new RegExp(`<${listType}>(.*?)</${listType}>`, "gs"),
      function (match, content) {
        const lines = content.split("\n");
        return lines
          .map((line) => {
            // Count the nesting level
            const level = (line.match(/<${listType}/g) || []).length;
            // Replace the li tags with appropriate number of asterisks/hashes
            return line.replace(
              /<li>(.*?)<\/li>/,
              prefix.repeat(level) + " $1"
            );
          })
          .join("\n");
      }
    );
  }

  let wikiText = html
    // Headers
    .replace(/<h1>(.*?)<\/h1>/g, "= $1 =")
    .replace(/<h2>(.*?)<\/h2>/g, "== $1 ==")
    .replace(/<h3>(.*?)<\/h3>/g, "=== $1 ===")
    .replace(/<h4>(.*?)<\/h4>/g, "==== $1 ====")
    .replace(/<h5>(.*?)<\/h5>/g, "===== $1 =====")
    .replace(/<h6>(.*?)<\/h6>/g, "====== $1 ======")

    // Basic formatting
    .replace(/<strong>(.*?)<\/strong>/g, "'''$1'''")
    .replace(/<b>(.*?)<\/b>/g, "'''$1'''")
    .replace(/<em>(.*?)<\/em>/g, "''$1''")
    .replace(/<i>(.*?)<\/i>/g, "''$1''")

    // Handle nested lists
    .replace(/<ul>[\s\S]*?<\/ul>/g, function (match) {
      return handleNestedLists(match, "ul");
    })
    .replace(/<ol>[\s\S]*?<\/ol>/g, function (match) {
      return handleNestedLists(match, "ol");
    })

    // Tables
    .replace(/<table.*?>([\s\S]*?)<\/table>/g, function (match, content) {
      const rows = content.match(/<tr>([\s\S]*?)<\/tr>/g) || [];
      return rows
        .map((row) => {
          // Handle header cells
          row = row.replace(/<th>([\s\S]*?)<\/th>/g, "! $1 ");
          // Handle regular cells
          row = row.replace(/<td>([\s\S]*?)<\/td>/g, "| $1 ");
          return "|-\n" + row.trim();
        })
        .join("\n");
    })

    // Definition lists
    .replace(/<dl>([\s\S]*?)<\/dl>/g, function (match, content) {
      return content
        .replace(/<dt>([\s\S]*?)<\/dt>/g, "; $1")
        .replace(/<dd>([\s\S]*?)<\/dd>/g, ": $1");
    })

    // Preformatted text and code
    .replace(/<pre>([\s\S]*?)<\/pre>/g, " $1")
    .replace(/<code>([\s\S]*?)<\/code>/g, "`$1`")

    // Horizontal rules
    .replace(/<hr\s*\/?>/g, "----")

    // Subscript and superscript
    .replace(/<sub>([\s\S]*?)<\/sub>/g, "<sub>$1</sub>")
    .replace(/<sup>([\s\S]*?)<\/sup>/g, "<sup>$1</sup>")

    // Strikethrough
    .replace(/<s>([\s\S]*?)<\/s>/g, "<strike>$1</strike>")
    .replace(/<del>([\s\S]*?)<\/del>/g, "<strike>$1</strike>")

    // Underline
    .replace(/<u>([\s\S]*?)<\/u>/g, "<u>$1</u>")

    // Block quotes
    .replace(
      /<blockquote>([\s\S]*?)<\/blockquote>/g,
      function (match, content) {
        return content
          .split("\n")
          .map((line) => ":" + line)
          .join("\n");
      }
    )

    // External links
    .replace(/<a href="(https?:\/\/.*?)">(.*?)<\/a>/g, "[$1 $2]")
    // Internal links
    .replace(
      /<a href="(?!https?:\/\/)([^"]+)">(.*?)<\/a>/g,
      function (match, url, text) {
        return url === text ? `[[${url}]]` : `[[${url}|${text}]]`;
      }
    )

    // Paragraphs and line breaks
    .replace(/<p>(.*?)<\/p>/g, "$1\n\n")
    .replace(/<br\s*\/?>/g, "\n")

    // Remove any remaining HTML tags
    .replace(/<[^>]*>/g, "")

    // Fix spaces and clean up
    .replace(/&nbsp;/g, " ")
    .replace(/\n\n\n+/g, "\n\n")
    .trim();

  return wikiText;
}

const start = async () => {
  console.log("Loging in to wiki...");
  await login();
  const spreadsheetId = process.env.SPREAD_SHEET_ID;
  const range = process.env.SATASNG_SPREAD_SHEET_RANGE; //
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
    console.error("Error fetching XL page data, Please rerun.", error);
    start(); //todo romove.
  } finally {
    console.log("completed run");
  }
};

start();

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
    start();
  }
}

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
    const result = await createWikiSatsangPage(row);
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
const filePath = path.join(__dirname, `output-${Date.now()}.csv`);

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
      console.error(
        "Failed to create page, see csv for more details",
        createPageResponse.data
      );
    }
  } catch (error) {
    pageCreationStatus = "Error";
    message = error.message;
    console.error("Error during page creation, see csv row for more details");
    return { pageCreationStatus, message };
  }
  return { pageCreationStatus, message, pageURL };
}

async function createWikiSatsangPage(row) {
  const photos = row[5].replaceAll("https://", ",https://");
  const photosContent = getPhotoPaths(photos).galleryContent;
  const title = row[1].replaceAll(" ", "_");
  const year = row[1].split(" ")[2];
  const month = row[1].split(" ")[1];

  // Example plain text to HTML conversion
  const plainText = row[4];
  // Convert Markdown to HTML
  const html = marked(plainText);
  const wikiText = getWikiText(html);

  const template = `
==Title==
${row[2]}
==Link to Video: ==
{{#evu: 
${row[3]}
|alignment=center }}

==Transcript:==


<div align="center"> 

===Link to Facebook Posts===
${row[6]}
[[category:satsang]][[Category:${month}]][[Category:${year}]]`;
  console.log("Rewriting content using AI");
  const aiContent = await processText(wikiText, template, photosContent);
  const response = await createPage(title, aiContent);
  return response;
}

async function processText(wikiText, template = "", photosContent) {
  const blocks = splitTextByWordCount(wikiText, 3000);
  // if (template != "") blocks.push(template);
  console.log(
    "Spliting the large satsang text to " + blocks.length + " blocks"
  );

  const apiPromises = blocks.map(async (txt) => {
    try {
      const result = await rewriteusingAI(txt, JSON.stringify([]));
      return result;
    } catch (error) {
      console.error("Error during AI rewriting call");
      throw error;
    }
  });

  try {
    const allResults = await Promise.all(apiPromises);
    // let content = allResults.pop();
    return template.replace(
      "==Transcript:==",
      "==Transcript:=="+allResults.join(" ") + photosContent
    );
  } catch (error) {
    console.error("One or more api calls have failed:", error);
    throw error;
  }
}

function getPhotoPaths(files) {
  if (!files) return { galleryContent: "" };

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

  const fileArray = files.split(",").filter((file) => file.trim());

  // Create gallery section with masonry-style layout
  const gallerySection = `
  =='''Event Photos'''==
  <div class="photo-gallery" style="column-count: 3; column-gap: 5pxs; padding: 5px;">
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
  </div>
  `;

  return {
    galleryContent: gallerySection,
  };
}

function buildPrompt(pageConent, userInputs) {
  // pageConent =
  //   pageConent ||
  //   "event went very well with more the 40 peoples and 100 online peoples , done annadhan, neivaithyams and abishekamna and alankaram";
  let prompt = `\nInstructions:\n;

Transform the given wiki page fomated content into  more  vaild wiki format,  suitable for publication on Nithyanandapedia. 

1) use bullet point, 
2) DO not change the capital letter case of alphabets from Upper to lower or from lower to upper use as is.
3) make paragraps whenever nessary, that is add addtional  line space after few related bullet points
4) Do not change content language, DO NOT rephrase, use the text as is just do formating changes like buttet point paragrapsh etc.  
5) other than ==Transcript:== section remove all other blank section with no content. do not add filler content to blank sections

Original content: ${pageConent}
`;
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

function splitTextByWordCount(text, maxWords = 1000) {
  if (!text || typeof text !== "string") {
    return []; // Handle invalid input
  }

  const words = text.split(/\s+/); // Split by whitespace
  const chunks = [];
  let currentChunk = "";
  let currentChunkWordCount = 0;

  for (const word of words) {
    if (currentChunkWordCount < maxWords) {
      currentChunk += word + " ";
      currentChunkWordCount++;
    } else {
      chunks.push(currentChunk.trim());
      currentChunk = word + " ";
      currentChunkWordCount = 1;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}
