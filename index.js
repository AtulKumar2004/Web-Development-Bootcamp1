import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import axios from "axios";
import pg from "pg";
import bcrypt from "bcrypt";
import session from "express-session";
import passport from "passport";
import { Strategy } from "passport-local";
import path from "path";
import multer from "multer";
import FormData from "form-data";
import { Readable } from "stream";
import fs from "fs";

const app = express();
const port = 3000;
const saltRounds = 10;

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        return cb(null, "./uploads");
    },
    filename: function (req, file, cb) {
        return cb(null, `${Date.now()}-${file.originalname}`)
    },
});

const upload = multer({ storage });

app.use(session({
    secret: "TOPSECRETWORD",
    resave: false,
    saveUninitialized: true,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24,
    }
}));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set('view engine', 'ejs');

app.use(passport.initialize());
app.use(passport.session());

const db = new pg.Client({
    user: "postgres",
    host: "localhost",
    database: "Cats",
    password: "Atul@2004",
    port: 5432,
});
db.connect();

let c = 0;
let v = 0;

const config = {
    headers: {
        'x-api-key': `live_MBZEvrCC6XP6fp97ozUuwFBeAKJq3DhllUSB1kX94sdOZ9C5POF11kTXImoQw3EB`
    }
};

app.get("/", (req, res) => {
    res.render("index.ejs");
});

app.get("/login", (req, res) => {
    if (v == 1) {
        res.render("login-signup.ejs", { err: "Invalid Password! Please try again." });
        v = 0;
    } else if (v == 2) {
        res.render("login-signup.ejs", { err: "New user? Sign up below!" });
        v = 0;
    } else {
        res.render("login-signup.ejs");
    }
});

app.get("/sign-up", (req, res) => {
    if (c == 1) {
        res.render("login-signup.ejs", { value: "up", error: "This user already exists! Try logging in" });
        c = 0;
    } else {
        res.render("login-signup.ejs", { value: "up" });
    }
});

app.get("/showcase", async (req, res) => {
    console.log(req.user);
    try {
        if (req.isAuthenticated()) {
            const result = await axios.get(`https://api.thecatapi.com/v1/images/search?size=med&mime_types=jpg&format=json&has_breeds=true&order=RANDOM&page=0&limit=21`, config);
            const favs = await db.query("SELECT image_id FROM favourites WHERE email=$1",[req.user.email]);
            console.log(result.data);
            console.log(favs.rows);
            let listOfKitties = [];
            let listOfFavs = [];
            result.data.forEach(element => {
                listOfKitties.push(element.id);
            });
            favs.rows.forEach(element => {
                listOfFavs.push(element.image_id);
            });
            res.render("showcase.ejs", { listOfCats: result.data,favs: listOfFavs,kitties: listOfKitties});
        } else {
            res.redirect("/login");
        }
    } catch(error) {
        console.error(error);
    }
});

app.get("/logout", (req, res) => {
    req.logout(function (err) {
        if (err) {
            return next(err);
        }
        res.redirect("/");
    });
});

app.get("/uploads", async (req, res) => {
    console.log(req.user);
    if (req.isAuthenticated()) {
        try {
            const result = await axios.get(`https://api.thecatapi.com/v1/images/?limit=10&page=0&order=DESC&sub_id=${req.user.email}`, config);
            if (result.data.length > 0) {
                res.render("uploads.ejs", { upload: result.data });
            } else {
                res.render("uploads.ejs", { message: "No uploads yet" });
            }
        } catch (err) {
            console.error(err);
        }
    } else {
        res.redirect("/login");
    }
});

app.get("/submit-image", (req, res) => {
    res.redirect("/uploads");
});

app.post("/submit-image", upload.single('image'), async (req, res) => {
    console.log(req.user.email);
    console.log(req.file);
    let formData = new FormData();
    formData.append('file', fs.createReadStream(req.file.path));
    formData.append('sub_id', req.user.email);
    try {
        const result = await axios.post(`https://api.thecatapi.com/v1/images/upload`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
                'x-api-key': `live_MBZEvrCC6XP6fp97ozUuwFBeAKJq3DhllUSB1kX94sdOZ9C5POF11kTXImoQw3EB`,
            },
            transformRequest: [
                (data) => data,
            ]
        });
        console.log(result.data);
        res.redirect("/uploads");
    } catch (err) {
        console.error(err.message);
    }
});

app.get("/delete", (req, res) => {
    res.redirect("/uploads");
});

app.post("/delete", async (req, res) => {
    let catId = req.body.id;
    try {
        await axios.delete(`https://api.thecatapi.com/v1/images/${catId}`, config);
        res.redirect("/uploads");
    } catch (err) {
        console.error(err.message);
    }
});

app.get("/search", async (req, res) => {
    res.redirect("/showcase");
});

app.post("/search", async (req, res) => {
    const id = req.body.animalid;
    try {
        const result = await axios.get(`https://api.thecatapi.com/v1/images/${id}`, config);
        const favs = await db.query("SELECT image_id FROM favourites WHERE email=$1",[req.user.email]);
        let listOfFavs = [];
        favs.rows.forEach(element => {
            listOfFavs.push(element.image_id);
        });
        console.log(result.data);
        res.render("showcase.ejs", { oneCat: result.data,favs: listOfFavs,kitties: req.body.animalid,});
    } catch (error) {
        console.error("Not found", error.message);
        res.render("showcase.ejs", { NotFound: `Couldn't find an image matching the passed 'id' of ${id}` });
    }
});

app.get("/save",(req,res) => {
    res.redirect("/showcase");
});

app.post("/save", async (req, res) => {
    let image_id = req.body.data;
    console.log(req.body.data);
    try {
        const outcome = await db.query("SELECT image_id FROM favourites WHERE email=$1 AND image_id=$2", [req.user.email, image_id]);
        if (outcome.rows == 0) {
            await db.query("INSERT INTO favourites(email,image_id) VALUES($1,$2)", [req.user.email, image_id]);
            res.json({ success: true, message: 'Data saved successfully!' });
        } else {
            await db.query("DELETE FROM favourites WHERE email=$1 and image_id=$2", [req.user.email, image_id]);
            res.json({ success: true, message: 'Data deleted successfully!' });
        }
    } catch (err) {
        console.error(err.message);
    }
});

app.post("/sign-up", async (req, res) => {
    const email = req.body.username;
    const password = req.body.password;
    c = 0;

    try {
        const checkResult = await db.query("SELECT * FROM users WHERE email = $1", [
            email,
        ]);

        if (checkResult.rows.length > 0) {
            console.log("This user already exists");
            c = 1;
            res.redirect("/sign-up");
        } else {
            //hashing the password and saving it in the database
            bcrypt.hash(password, saltRounds, async (err, hash) => {
                if (err) {
                    console.error("Error hashing password:", err);
                } else {
                    console.log("Hashed Password:", hash);
                    const result = await db.query(
                        "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING *",
                        [email, hash]
                    );
                    const user = result.rows[0];
                    req.login(user, (err) => {
                        console.log(err);
                        res.redirect("/showcase");
                    });
                }
            });
        }
    } catch (err) {
        console.log(err);
    }
});

app.post("/login", passport.authenticate("local", {
    successRedirect: "/showcase",
    failureRedirect: "/login",
}));

passport.use(new Strategy(async function verify(username, password, cb) {
    v = 0;
    console.log(username);
    try {
        const result = await db.query("SELECT * FROM users WHERE email = $1", [
            username,
        ]);
        if (result.rows.length > 0) {
            const user = result.rows[0];
            const storedHashedPassword = user.password;
            bcrypt.compare(password, storedHashedPassword, (err, result) => {
                if (err) {
                    return cb(err);
                } else {
                    console.log(result);
                    if (result) {
                        return cb(null, user);
                    } else {
                        v = 1;
                        console.log("Invalid password!");
                        return cb(null, false);
                    }
                }
            });
        } else {
            v = 2;
            console.log("User does not exist!");
            return cb(null, false);
        }
    } catch (err) {
        return cb(err);
    }
}));

passport.serializeUser((user, cb) => {
    cb(null, user);
});

passport.deserializeUser((user, cb) => {
    cb(null, user);
});

app.listen(port, () => {
    console.log(`Successfully started on port ${port}`);
});