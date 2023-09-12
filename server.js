const express = require('express');
const multer = require('multer');
const app = express();
const port = 3000;
var slugify = require('slugify');
const makeDir = require('make-dir');
const fs = require('fs');


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

// const upload = multer({ storage: storage });
// Middleware to handle file uploads

app.post('/upload', multer({ storage: getMutlerConfig() }).array('files', 200), (req, res) => {
    // Access uploaded files via req.files
    if (!req.files || req.files.length === 0) {
        return res.status(400).send('No files were uploaded.' + JSON.stringify(req.body));
    }
    const folder = `uploads/${slugify(req.body.date.toString())}/${slugify(req.body.entity.toString())}/`;
    fs.appendFile('uploads/files.json', JSON.stringify({ ...req.body, files: req.files, folder, timestamp: Date.now() }), function (err) {
        if (err) throw err;
        console.log('Saved!');
    });


    res.send('Files uploaded successfully at ' + folder);

});





app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

