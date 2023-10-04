const express = require('express');
const multer = require('multer');
const app = express();
const port = 3000;
var slugify = require('slugify');
const makeDir = require('make-dir');
const fs = require('fs');
const filepath = require('path');


function getMutlerConfig() {
    // path exists unless there was an error
    return multer.diskStorage({
        destination: (req, file, cb) => {
            const folder = `uploads/${slugify(req.body.date.toString())}/${slugify(req.body.entity.toString())}/`;
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
        return res.status(400).send('No files were uploaded.' + JSON.stringify(req.body));
    }
    const folder = `uploads/${slugify(req.body.date.toString())}/${slugify(req.body.entity.toString())}/`;
    const photoInfo = { ...req.body, files: req.files, folder, timestamp: Date.now() };
    fs.appendFile('uploads/files.json', JSON.stringify(photoInfo), function (err) {
        if (err) throw err;
        console.log('Saved!');
    });

    updateDocument(photoInfo);
    res.send('Files uploaded successfully at ' + folder);
});


app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

const { MongoClient, ObjectID } = require('mongodb');

// Connection URI for your MongoDB server
const uri = 'mongodb://localhost:27017/photos'; // Replace with your database URI


// Function to update the document
async function updateDocument(updateData) {
    const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

    try {
        // Connect to MongoDB
        await client.connect();

        const collection = client.db().collection('your-collection-name'); // Replace with your collection name

        // Define the filter to find the document you want to update
        const filter = { email_id: updateData.email_id };

        // Define the update operation
        const updateOperation = {
            $set: updateData // Use $set to update the specified fields
        };

        // Perform the update
        const result = await collection.updateOne(filter, updateOperation);

        console.log(`Document updated: ${result.modifiedCount} document(s) modified`);
    } finally {
        // Close the MongoDB connection
        await client.close();
    }
}

// Call the updateDocument function to update the document
updateDocument().catch(console.error);
