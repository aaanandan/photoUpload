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
        console.log(`New record added: ${result.insertedId}`);
    }
    return res.status(200).send({ 'message': 'files uploaded sucessfully to :' + folder });

});


app.listen(port, () => {
    console.log(`server  is running on port ${port}`);


});
function getFolderName(req) {
    // console.log('req',req, JSON.stringify(req.body));
    return `uploads/${slugify(req.body.startDate.toString().substring(0, 25).replaceAll(":", '.'))}/${slugify(req.body.place.toString())}/`;
}

