function createWikiEventPage(photoInfo) {
  // console.log(photoInfo);
  const request = require("request");
  url = "https://nithyanandapedia.org/api.php";

  // Step 1: GET request to fetch login token
  function getLoginToken() {
    console.log("step 1");
    var params_0 = {
      action: "query",
      meta: "tokens",
      type: "login",
      format: "json",
    };

    request.get({ url: url, qs: params_0 }, function (error, res, body) {
      if (error) {
        return;
      }
      var data = JSON.parse(body);
      console.log("getLoginToken", res.toJSON());
      loginRequest(data.query.tokens.logintoken);
    });
  }

  // Step 2: POST request to log in.
  // Use of main account for login is not
  // supported. Obtain credentials via Special:BotPasswords
  // (https://www.mediawiki.org/wiki/Special:BotPasswords) for lgname & lgpassword
  function loginRequest(login_token) {
    console.log("step 2", login_token);
    //username: Sri.mayatita password:testkailasa@660756rkmsdub45950nrqrbmr0m5mfgm
    var params_1 = {
      action: "login",
      lgname: "testkailasa",
      lgpassword: "kenyakailasa",
      lgtoken: login_token,
      format: "json",
    };

    //username: Sri.mayatita
    //password: testkailasa@660756rkmsdub45950nrqrbmr0m5mfgm

    request.post({ url: url, form: params_1 }, function (error, res, body) {
      if (error) {
        console.log("error:::");
        return;
      }
      console.log("loginRequest step2 ", body);
      getCsrfToken();
    });
  }

  // Step 3: GET request to fetch CSRF token
  function getCsrfToken() {
    console.log("step 3");
    var params_2 = {
      action: "query",
      meta: "tokens",
      format: "json",
    };

    request.get({ url: url, qs: params_2 }, function (error, res, body) {
      if (error) {
        return;
      }
      var data = JSON.parse(body);
      console.log("tokenData :::::", data, res.toJSON());
      editRequest(data.query.tokens.csrftoken);
    });
  }

  let content = "Sample content";

  // const pathGrp = getPhotoPaths(photoInfo.files);

  //   let content = `__NOTOC__

  // ='''${photoInfo.entity} on  ${photoInfo.startDate}'''=

  // ==''${photoInfo.activityType}''==
  // {{
  // EventDetails|
  // participantsCount=${photoInfo.livesEnriched}|
  // eventType=${photoInfo.eventType}|
  // foodServedInEvent=|
  // mealsCount=|
  // volunteersCount=${photoInfo.volunteerCount}|
  // eventDuration=
  // }}

  // ${photoInfo.presidentialBriefing}
  // ${photoInfo.activityType.split(",").map((e) => {
  //   "#" + e.toString();
  // })} ${"#" + photoInfo.eventType}

  // =='''Presidential Daily Briefing'''==
  // ${pathGrp.paths.toString()}</div>
  // </div>

  // =='''Pictures from the day'''==

  // <div id="event_pictures">
  // <gallery mode=packed-hover heights=200px>
  // ${pathGrp.paths1.toString()}
  // ${pathGrp.paths2.toString()}
  // ${pathGrp.paths3.toString()}
  // ${pathGrp.pathsMore.toString()}
  // </gallery>
  // </div>

  // ${photoInfo.activityType.split(",").map((e) => {
  //   "[[Category:" + e + "]]";
  // })}
  // `;

  // Step 4: POST request to edit a page
  function editRequest(csrf_token) {
    var params_3 = {
      action: "edit",
      title: "Nithyanandapedia.org:Sandbox",
      appendtext: content,
      token: csrf_token,
      format: "json",
    };

    console.log("URL and params", url, params_3);

    request.post({ url: url, form: params_3 }, function (error, res, body) {
      if (error) {
        console.log("Error");
        return;
      }
      console.log("post response ::", body);
    });
  }

  // Start From Step 1
  getLoginToken();
}

createWikiEventPage();

// const axios = require('axios');
// const FormData = require('form-data');

// const wikiUrl = 'https://nithyanandapedia.org/api.php';
// const username = 'Sri.mayatita';
// const password = 'testkailasa@660756rkmsdub45950nrqrbmr0m5mfgm';

// async function login() {
//     try {
//         // Step 1: Get login token
//         const loginTokenResponse = await axios.get(wikiUrl, {
//             params: {
//                 action: 'query',
//                 meta: 'tokens',
//                 type: 'login',
//                 format: 'json',
//             },
//         });

//         const loginToken = loginTokenResponse.data.query.tokens.logintoken;

//         // Step 2: Log in with the token
//         const formData = new FormData();
//         formData.append('action', 'login');
//         formData.append('lgname', username);
//         formData.append('lgpassword', password);
//         formData.append('lgtoken', loginToken);
//         formData.append('format', 'json');

//         const loginResponse = await axios.post(wikiUrl, formData, {
//             headers: formData.getHeaders(),
//         });

//         console.log('Login Response:', loginResponse.data);

//         if (loginResponse.data.login.result === 'Success') {
//             console.log('Logged in successfully!');
//             return loginResponse.headers['set-cookie'];
//         } else {
//             console.error('Failed to log in:', loginResponse.data.login.result);
//         }
//     } catch (error) {
//         console.error('Login error:', error);
//     }
// }

// async function createPage(cookie, pageTitle, pageContent) {
//   try {
//       // Step 3: Get an edit token
//       const editTokenResponse = await axios.get(wikiUrl, {
//           params: {
//               action: 'query',
//               meta: 'tokens',
//               format: 'json',
//           },
//           headers: {
//               Cookie: cookie.join('; '),
//           },
//       });

//       const editToken = editTokenResponse.data.query.tokens.csrftoken;

//       // Step 4: Create the page
//       const formData = new FormData();
//       formData.append('action', 'edit');
//       formData.append('title', pageTitle);
//       formData.append('text', pageContent);
//       formData.append('token', editToken);
//       formData.append('format', 'json');

//       const createPageResponse = await axios.post(wikiUrl, formData, {
//           headers: {
//               ...formData.getHeaders(),
//               Cookie: cookie.join('; '),
//           },
//       });

//       console.log('Create Page Response:', createPageResponse.data);
//   } catch (error) {
//       console.error('Create page error:', error);
//   }
// }

// // Example usage
// async function main() {
//   const cookie = await login();
//   if (cookie) {
//       await createPage(cookie, 'Sample Page Title', 'This is the content of the sample page.');
//   }
// }

// main();

// // var bot = require("nodemw");
// // createWikiEventPage();
// // function createWikiEventPage() {
// //   // pass configuration object

// //   const client = new bot({
// //     protocol: "https", // Wikipedia now enforces HTTPS
// //     server: "nithyanandapedia.org", // host name of MediaWiki-powered site
// //     path: "/w", // path to api.php script
// //     debug: false, // is more verbose when set to true
// //     username: "Sri.mayatita", // account to be used when logIn is called (optional)
// //     password: "testkailasa@660756rkmsdub45950nrqrbmr0m5mfgm", // password to be used when logIn is called (optional)
// //     domain: "nithyanandapedia.org", // domain to be used when logIn is called (optional)
// //     userAgent: "Custom UA", // define custom bot's user agent
// //     concurrency: 5, // how many API requests can be run in parallel (defaults to 3)
// //   });

// //   bot.login("Sri.mayatita", "testkailasa@660756rkmsdub45950nrqrbmr0m5mfgm")
// //     .done(function (data) {
// //       console.log("You are logged in as " + data.login.lgusername);
// //     });
// // }

// const axios = require("axios");

// // Define your MediaWiki API URL and credentials
// const apiUrl = "https://nithyanandapedia.org/api.php";
// const username = "testkailasa"; // replace with your username
// const password = "kenyakailasa"; // replace with your password

// // Create an instance of axios with cookies enabled
// const api = axios.create({
//   baseURL: apiUrl,
//   withCredentials: true,
//   headers: {
//     "Content-Type": "application/x-www-form-urlencoded",
//   },
// });

// // Function to login to MediaWiki
// async function login() {
//   try {
//     // Step 1: Fetch the login token
//     const loginTokenResponse = await api.get("", {
//       params: {
//         action: "query",
//         meta: "tokens",
//         type: "login",
//         format: "json",
//       },
//     });

//     const loginToken = loginTokenResponse.data.query.tokens.logintoken;

//     // Step 2: Log in using the login token
//     const loginResponse = await api.post(
//       "",
//       new URLSearchParams({
//         action: "login",
//         lgname: username,
//         lgpassword: password,
//         lgtoken: loginToken,
//         format: "json",
//       })
//     );

//     if (loginResponse.data.login.result !== "Success") {
//       throw new Error("Login failed: " + loginResponse.data.login.reason);
//     }

//     console.log("Login successful!");
//   } catch (error) {
//     console.error("Error during login:", error.message);
//   }
// }

// // Function to create a page in MediaWiki
// async function createPage(pageTitle, pageContent) {
//   try {
//     // Step 3: Get a CSRF token
//     const csrfTokenResponse = await api.get("", {
//       params: {
//         action: "query",
//         meta: "tokens",
//         format: "json",
//       },
//     });

//     const csrfToken = csrfTokenResponse.data.query.tokens.csrftoken;

//     // Step 4: Use the CSRF token to create a page
//     const createPageResponse = await api.post(
//       "",
//       new URLSearchParams({
//         action: "edit",
//         title: pageTitle,
//         text: pageContent,
//         token: csrfToken,
//         format: "json",
//       })
//     );

//     if (
//       createPageResponse.data.edit &&
//       createPageResponse.data.edit.result === "Success"
//     ) {
//       console.log("Page created successfully!");
//     } else {
//       console.error("Failed to create page:", createPageResponse.data);
//     }
//   } catch (error) {
//     console.error("Error during page creation:", error.message);
//   }
// }

// // Execute the login and page creation
// (async () => {
//   await login();
//   await createPage("YourPageTitle", "YourPageContent"); // Replace with your page title and content
// })();
