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

// Execute the login and page creation
function createWikiEventPage(photoInfo) {
  await login();

  let content = `__NOTOC__

  ='''${photoInfo.entity} on  ${photoInfo.startDate}'''=
  
  ==''${photoInfo.activityType}''==
  {{
  EventDetails|
  participantsCount=${photoInfo.livesEnriched}|
  eventType=${photoInfo.eventType}|
  foodServedInEvent=|
  mealsCount=|
  volunteersCount=${photoInfo.volunteerCount}|
  eventDuration=
  }}
  
  ${photoInfo.presidentialBriefing}
  ${photoInfo.activityType.split(",").map((e) => {
    "#" + e.toString();
  })} ${"#" + photoInfo.eventType}
  
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
  
  ${photoInfo.activityType.split(",").map((e) => {
    "[[Category:" + e + "]]";
  })}
  `;
  await createPage("test content created", "test content created"); // Replace with your page title and content
};
