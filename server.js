const express = require("express");
const moduleToFetch = require("./index");
const getDatabase = moduleToFetch.getDatabase;
const setAuthKey = moduleToFetch.setAuthKey;
const newEntryToDatabase = moduleToFetch.newEntryToDatabase;

const port = 8000;

const app = express();

app.use(express.static("public"));
app.use(
  express.urlencoded({
    extended: true,
  })
);

app.get("/users", async (req, res) => {
  setAuthKey("secret_lDLNauvIFirlhqqRMvKHv3o3W87JDKhHVap46wRZBoL");
  const users = await getDatabase("54e8d49de9fb47f688287ff6814de79f");
  res.json(users);
});

app.post("/submit-form", async (req, res) => {
  const name = req.body.name;
  const role = req.body.role;
  await newEntryToDatabase(name, role);
  res.redirect("/");
  res.end();
});

app.get("/page", async (id) => {
  moduleToFetch.getPageData("94cf19fb911240f78e6aeb565f3178e1");
})

app.listen(port, console.log(`Server started on ${port}`));
