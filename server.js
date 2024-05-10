const express = require('express');
const multer = require('multer');
const app = express();
const port = 3000;
var slugify = require('slugify');
const makeDir = require('make-dir');
const fs = require('fs');
const filepath = require('path');
// var cors = require('cors');
// app.use(cors());
const {GoogleSpreadsheet} = require('google-spreadsheet');
const {JWT} = require('google-auth-library');

app.use(express.static('uploads'))


function getMutlerConfig() {
    // path exists unless there was an error
    return multer.diskStorage({
        destination: (req, file, cb) => {
            const folder = getFolderName(req);
            console.log('folder:::', folder);
            (async () => {
                const path = await makeDir(folder);
                console.log(path);
                cb(null, folder);
                //=> '/Users/sindresorhus/fun/unicorn/rainbow/cake'
            })();
        }, filename: (req, file, cb) => {
            // Define how the uploaded files should be named
            cb(null, Date.now() + '-' + file.originalname);
        },
    });
}

// Multer configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Define the directory where uploaded files will be stored
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        // Define how the uploaded files should be named
        cb(null, Date.now() + '-' + file.originalname);
    },
});


app.use(express.static(filepath.join(__dirname, 'build')));

app.get('/', function (req, res) {
    res.sendFile(filepath.join(__dirname, 'build', 'index.html'));
});

// const upload = multer({ storage: storage });
// Middleware to handle file uploads

app.post('/upload', multer({ storage: getMutlerConfig() }).array('files', 200), (req, res) => {
    // Access uploaded files via req.files
    if (!req.files || req.files.length === 0) {
        return res.status(400).send({ message: 'No files found', ...req.body });
    }
    const folder = getFolderName(req);
    const photoInfo = { ...req.body, files: req.files, folder, timestamp: Date.now() };
    fs.appendFile('uploads/files.json', JSON.stringify(photoInfo), function (err) {
        if (err) throw err;
        console.log('Saved!');
    });

    const { MongoClient } = require('mongodb');
    async function updateToDB() {
        const uri = "mongodb://127.0.0.1:27017/";
        const client = new MongoClient(uri);
        try {
            await client.connect();
            await addRecord(client, photoInfo);
        } finally {
            await client.close();
        }
    }
    updateToDB().catch(console.error);
    async function addRecord(client, photoInfo) {
        const result = await client.db("photos").collection("photos").insertOne(photoInfo);
        await updateSheet(photoInfo);
        //TODO: Fix activityType files to support map function to enable wikik event page creation 
        //await createWikiEventPage(photoInfo);
        console.log(`New record added: ${result.insertedId}`);
    }
    return res.status(200).send({ 'message': 'files uploaded sucessfully to :' + folder });

});


app.listen(port, () => {
    console.log(`server  is running on port ${port}`);
});
function getFolderName(req) {
    // console.log('req',req, JSON.stringify(req.body));
    return `uploads/${slugify(req.body.startDate.toString().substring(0, 25).replaceAll(":", '.')) + '-' + slugify(req.body.place.toString())}/${slugify(req.body.place.toString())}/`;
}

async function updateSheet(photoInfo) {
    // Initialize auth - see https://theoephraim.github.io/node-google-spreadsheet/#/guides/authentication
    const serviceAccountAuth = new JWT({
        // env var values here are copied from service account credentials generated by google
        // see "Authentication" section in docs for more info
        email: 'googlesheet@crafty-shield-304018.iam.gserviceaccount.com',
        key: '-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCv5d1q5Lue2yuA\n7wBitaclOF6NE1uvEgbxaf9z0bMhCmdgFiv+G8A4Kncx6+n+3CCG9xhiHYmSIlcB\n/w6HMTBNWZuI4L3NjFwc8DbPGWLmq6+wJI8FdePXNtWC0V8/8xUsSv/wvEDwu1W9\niDCZz4jYC1iD522g6HcNRKqFH/6DI08e0K1o6/aa7mevJaUapYOj5/EfBg13HmKG\nSvCHj4DzhKmLUowZvYYg2AOoJswnRv1/jUzHiNECqV6PC0fe5shLthOBxs5BOdxA\nso40hKQcdLcfxQtY2abGtPmiASnH3QrxKVS3L0fqVk7HiZcFtGJ17MBZsGgQW27c\nYxeclPBtAgMBAAECggEAI8j7C+Uu+nmSVy/If0x/jcXzDnZyv6JGQVUUQGbYL4+j\nSlwYZSEWMRcKmuBpAY2dHHgmwMdLlqxf0SsntH9gWUwypV07oBa/IrAIJof+o/kn\nzAkUA8NhMAaa13trCmKU2ycC/OH/wDoMjnunj5M2PuXIA0XQ+txwZAWlP2Ir8Fen\nLmsImXvBhI4OJgIeH1lfp27qgWbf/k1N/rNF2PVFF5QaN06Tsib8rC/HEgQkjcj5\nFgue2WPOMNG2ac/mOY8WXFX+c955vaKVP2Rmpnl59YQcK5ERzbmexCAOJjzPq0+Y\ncUmVDbo5Igfm4VQy7TknSP1sGw/nOdnC9bTiYag7gQKBgQDetWNvFY/Tx5zPUMpk\nM+khiZy1hWZrqlXs40KjO4qwf8OvSORb4g5vbVxuxPLEmvh8wdUEeLw5XIAGIJ4B\n+JfwJlUXzftAFQu35WBS1oSrL2i+SQfQtlpNUwXHR8kYAAaO+Ierij/ONVrXkcpF\nIkdngKsN+274Lu5sL60eTCeDzQKBgQDKMSB13NkEFFvkcI2r5Ykx1h8I0/KDTmFs\njg90BRcI2M1dpwt/caMXfChSyMKVBMKmKZgCKxLfyt/rF//eNU/dDZ78UcJFEwCP\n9OmgerPB4NpnBHNvOpOJ9Qqa2uHXhiXdIL2mCjc2CiLAZdLmQvc7swVFYIB8YoLJ\nlSejl8O/IQKBgQCbHICVpNHYsaVgqydbZOBRkHPJ5ZBxGmDgLWSDJfwxc7sKAV2z\nNR3Ss7t2Fsvy7PB2i9XeWGzYErnECsGiI89G3pvTiY4dksrnmOVerLQYOlvcdCby\nUZ9RTaqvoirIAXSP7T8o1ZAdAgI0NAFJ51cOGoqIoX8nciByzz3m5Sl8XQKBgGil\nOnal4c/htZmqwzgnaXVYq+FGyOo6o+OqNsdGZyCWDNweu62vI8jg4oHOFB9KQm/7\ncQgWQQOAnZmwZyYbk4UGKrXOnuxfJFhdWplLSEPc20ycGh6EQ54QK/fvtxlz/Z7P\n9je8a8zVPB011gyEti64vc6lXnqCBczNHKHnx1DhAoGAGppdRR9hrJDFmHt1SUY9\nyNNiVCNF3fJqZ6PG4gHCwe0zkDzABo4cvEhTjpgJEnscEMcGy0JxZXpljK2xtzG5\nB+YdAKQjFa8OT2JP10FfyztMsW73vUJM/DzjnCYzglX2pgR0GKe9VR68/zyEEX3z\nzNZtLHaARI4IjVM5On+a6dI=\n-----END PRIVATE KEY-----\n',
        scopes: [
            'https://www.googleapis.com/auth/spreadsheets',
        ],
    });

    const doc = new GoogleSpreadsheet('1m7XDg1drzLt098iOp0IAe6jZw3BkErNFbmk6ozqnl9o', serviceAccountAuth);
    await doc.loadInfo(); // loads document properties and worksheets
    console.log(doc.title);
    const sheet = doc.sheetsByIndex[0]; // or use `doc.sheetsById[id]` or `doc.sheetsByTitle[title]`

    const pathGrp = getPhotoPaths(photoInfo.files);
    
    let row = {
        "Timestamp": new Date(photoInfo.timestamp).toLocaleDateString("en-IN"),
        "Email": photoInfo.email,
        "FilledBy": "",
        "EntityType": photoInfo.eventType,
        "KailasaOrCategory": photoInfo.entity,
        "Country": "",
        "State": "",
        "City": photoInfo.place,
        "Zipcode": "",
        "EventName": photoInfo.eventName,
        "Subtitle": photoInfo.activityType,
        "EventDate": photoInfo.startDate,
        "EventDescription": photoInfo.description + ", " + photoInfo.presidentialBriefing,
        "Categories": photoInfo.activityType,
        "OtherMoreDetails": "",
        "UploadPictures": pathGrp.paths.toString(),
        "NumberOfPeopleAttended": photoInfo.livesEnriched,
        "OnlineInPersonEvent": "",
        "WasFoodServed": "",
        "HowManyPlatesOfFoodWereServed": "",
        "HowManyVolunteers": photoInfo.volunteerCount,
        "DurationOfTheEvent": "",
        "BudgetSpent": "",
        "Aacharya": "",
        "ChallengesFaced": "",
        "UploadMorePictures1": pathGrp.paths1.toString(),
        "UploadMorePictures2": pathGrp.paths2.toString(),
        "UploadMorePictures3": pathGrp.paths3.toString(),
        "UploadMorePictures4": pathGrp.pathsMore.toString(),
        "UploadPDB": "",
        "NumberOfNaivedhyamOffered": ""
    }


    const newRow = await sheet.addRow(row);
    console.log('added a row to XL sheet');
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
            path = file.destination.replaceAll("uploads/", "https://npediaimg.koogle.sk/") + file.filename;

            if (i < 10 && i >= 0) paths.push(path);
            if (i < 20 && i >= 10) paths1.push(path);
            if (i < 30 && i >= 20) paths2.push(path);
            if (i < 40 && i >= 30) paths3.push(path);
            if (i >= 40) pathsMore.push(path);
        }
    }
    return { paths, paths1, paths2, paths3, pathsMore };
}

function createWikiEventPage(photoInfo){
var request = require('request').defaults({ jar: true }),
    url = "https://nithyanandapedia.org/api.php";

// Step 1: GET request to fetch login token
function getLoginToken() {
    var params_0 = {
        action: "query",
        meta: "tokens",
        type: "login",
        format: "json"
    };

    request.get({ url: url, qs: params_0 }, function (error, res, body) {
        if (error) {
            return;
        }
        var data = JSON.parse(body);
        loginRequest(data.query.tokens.logintoken);
    });
}

// Step 2: POST request to log in. 
// Use of main account for login is not
// supported. Obtain credentials via Special:BotPasswords
// (https://www.mediawiki.org/wiki/Special:BotPasswords) for lgname & lgpassword
function loginRequest(login_token) {
    var params_1 = {
        action: "login",
        lgname: "Sri.shivajnana@MirroringBot",
        lgpassword: "9l4puuip0hcb59q4u2a4dk7qcfnfcrih",
        lgtoken: login_token,
        format: "json"
    };

    request.post({ url: url, form: params_1 }, function (error, res, body) {
        if (error) {
            return;
        }
        getCsrfToken();
    });
}

// Step 3: GET request to fetch CSRF token
function getCsrfToken() {
    var params_2 = {
        action: "query",
        meta: "tokens",
        format: "json"
    };

    request.get({ url: url, qs: params_2 }, function (error, res, body) {
        if (error) {
            return;
        }
        var data = JSON.parse(body);
        editRequest(data.query.tokens.csrftoken);
    });
}

const pathGrp = getPhotoPaths(photoInfo.files);

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
${photoInfo.activityType.map(e=>{'#'+e.toString()})} ${photoInfo.eventType.map(e=>{'#'+e.toString()}) }

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

${photoInfo.activityType.map(e=>{ '[[Category:'+e+']]'})}
`;

// Step 4: POST request to edit a page
function editRequest(csrf_token) {
    var params_3 = {
        action: "edit",
        title: "Project:Sandbox",
        appendtext: content,
        token: csrf_token,
        format: "json"
    };

    request.post({ url: url, form: params_3 }, function (error, res, body) {
        if (error) {
            return;
        }
        console.log(body);
    });
}

// Start From Step 1
getLoginToken();
}
