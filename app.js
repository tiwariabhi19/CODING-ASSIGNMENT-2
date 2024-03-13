const express = require("express");
const path = require("path");

const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const app = express();

app.use(express.json());

const databasePath = path.join(__dirname, "twitterClone.db");

let database = null;

const initializeDBAndServer = async () => {
  try {
    database = await open({
      filename: databasePath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server is Running at http://lacalhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

//jwtToken Verification

const authenticateToken = (request, response, next) => {
  const { tweet } = request.body;
  const { tweetId } = request.params;
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.payload = payload;
        request.tweetId = tweetId;
        request.tweet = tweet;
        next();
      }
    });
  }
};

//Register UPI

app.post("/register", async (request, response) => {
  const { username, password, name, gender } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  console.log(username, password, name, gender);
  const databasePath = await database.get(selectUserQuery);
  if (databasePath === undefined) {
    if (password.length < 6) {
      response.status(400);
      response.send("Password is too short");
    } else {
      const hashedPassword = await bcrypt.hash(password, 10);

      const createUserQuery = `
        INSERT INTO 
            user (username, name, password, gender) 
        VALUES 
            (
            '${username}', 
            '${name}',
            '${hashedPassword}', 
            '${gender}');`;
      await database.run(createUserQuery);
      response.status(200);
      response.send("User created successfully");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//login user

app.post("/login", async (request, response) => {
  const { username, password } = request.body;
  const selectUserQuery = `SELECT * FROM user WHERE username = '${username}';`;
  console.log(username, password);
  const databasePath = await database.get(selectUserQuery);
  console.log(databasePath);
  if (databasePath === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      databasePath.password
    );
    if (isPasswordMatched === true) {
      const jwtToken = jwt.sign(databasePath, "MY_SECRET_TOKEN");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//User Tweets

app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, username, name, gender } = payload;
  console.log(name);
  const getTweetsFeedQuery = `
   SELECT
    username,
    tweet,
    date_time AS dateTime
   FROM
    follower INNER JOIN tweet ON follower.following_user_id = tweet.user_id INNER JOIN user ON user.user_id = follower.following_user_id
   WHERE 
    follower.following_user_id = ${user_id}
   ORDER BY
    date_time  DESC
   LIMIT 4;`;
  const tweetFeedArray = await database.all(getTweetsFeedQuery);
  response.send(tweetFeedArray);
});

//Get User Name Follower

app.get("/user/following", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, username, name, gender } = payload;
  console.log(name);
  const getFollowsQuery = `
   SELECT
    name
   FROM
    user INNER JOIN follower ON user.user_id = follower.following_user_id
   WHERE 
    follower.follower_user_id = ${user_id};`;
  const userFollowsQuery = await database.all(getFollowsQuery);
  response.send(userFollowsQuery);
});

//API 5

app.get("/user/followers", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, username, name, gender } = payload;
  console.log(name);
  const userFollowersQuery = `
   SELECT
    name
   FROM
    user INNER JOIN follower ON user.user_id = follower.follower_user_id
   WHERE 
    follower.following_user_id = ${user_id};`;
  const userFollowersArray = await database.all(userFollowersQuery);
  response.send(userFollowersArray);
});

//API-6

app.get("/tweets/:tweetId", authenticateToken, async (request, response) => {
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, username, name, gender } = payload;
  console.log(name, tweetId);
  const tweetsQuery = `SELECT * FROM tweet WHERE tweet_id=${tweetId};`;
  const tweetsResult = await database.get(tweetsQuery);

  const userFollowersQuery = `
   SELECT
    *
   FROM
    user follower INNER JOIN user ON user.user_id = follower.following_user_id
   WHERE 
    follower.follower_user_id = ${user_id};`;
  const userFollowers = await database.all(userFollowersQuery);
  if (
    userFollowers.some(
      (item) => item.following_user_id === tweetsResult.user_id
    )
  ) {
    console.log(tweetsResult);
    console.log("---------");
    console.log(userFollowers);
    const getTweetDetailsQuery = `
    SELECT
        tweet,
        COUNT (DISTINCT(like.like_id)) AS likes,
        COUNT (DISTINCT(reply.reply_id)) AS replies,
        tweet.date_time AS dateTime
    FROM
        tweet INNER JOIN tweet ON tweet.tweet_id = like.tweet__id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
    WHERE
        tweet.tweet_id = ${tweetId} AND tweet.user_id=${userFollowers[0].user_id};`;
    const tweetDetails = await database.get(getTweetDetailsQuery);
    response.send(tweetDetails);
  } else {
    response.status = 401;
    response.send("Invalid Request");
  }
});

//API-7

app.get(
  "/tweets/:tweetId/likes",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request;
    const { payload } = request;
    const { user_id, username, name, gender } = payload;
    console.log(name, tweetId);

    const getLikedUserQuery = `
   SELECT
    *
   FROM
    follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN like ON like.tweet_id = tweet.tweet_id
    INNER JOIN user ON user.user_id = like.user_id
   WHERE 
    tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id};`;
    const likedUsers = await database.all(getLikedUserQuery);
    console.log(likedUsers);
    if (likedUsers.length !== 0) {
      let likes = [];
      const getNamesArray = (likedUsers) => {
        for (let item of likedUsers) {
          likes.push(item.username);
        }
      };
      getNamesArray(likedUsers);
      response.send({ likes });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API-8

app.get(
  "/tweets/:tweetId/replies",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request;
    const { payload } = request;
    const { user_id, username, name, gender } = payload;
    console.log(name, tweetId);

    const getRepliedUsersQuery = `
   SELECT
    *
   FROM
    follower INNER JOIN tweet ON tweet.user_id = follower.following_user_id INNER JOIN reply ON reply.tweet_id = tweet.tweet_id
    INNER JOIN user ON user.user_id = reply.user_id
   WHERE 
    tweet.tweet_id = ${tweetId} AND follower.follower_user_id = ${user_id};`;
    const repliedUsers = await database.all(getRepliedUsersQuery);
    console.log(repliedUsers);
    if (repliedUsers.length !== 0) {
      let replies = [];
      const getNamesArray = (repliedUsers) => {
        for (let item of repliedUsers) {
          let object = {
            name: item.name,
            reply: item.reply,
          };
          replies.push(object);
        }
      };
      getNamesArray(repliedUsers);
      response.send({ replies });
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API-9

app.get("/user/tweets", authenticateToken, async (request, response) => {
  const { payload } = request;
  const { user_id, username, name, gender } = payload;
  console.log(name, user_id);
  const getTweetsDetailsQuery = `
   SELECT
    tweet.tweet AS tweet,
    COUNT (DISTINCT(like.like_id)) AS likes,
    COUNT (DISTINCT(reply.reply_id)) AS replies,
    tweet.date_time AS dateTime
   FROM
    user INNER JOIN tweet ON user.user_id = tweet.user_id INNER JOIN like ON like.tweet_id = tweet. tweet_id INNER JOIN reply ON reply.tweet_id = tweet. tweet_id

   WHERE 
    user.user_id = ${user_id}
   GROUP BY
        tweet.tweet_id ;`;
  const tweetsDetails = await database.all(getTweetsDetailsQuery);
  response.send(tweetsDetails);
});

//API-10

app.post("/user/tweets", authenticateToken, async (request, response) => {
  const { tweet } = request;
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, username, name, gender } = payload;
  console.log(name, tweet_id);
  const postTweetQuery = `
   INSERT INTO
    tweet (tweet, user_id)
   VALUES
    (
        '${tweet}',
        ${user_id}
    );`;
  await database.run(postTweetQuery);
  response.send("Created a Tweet");
});

//API-11
app.delete("/tweets/:tweetId", authenticateToken, async (request, response) => {
  const { tweetId } = request;
  const { payload } = request;
  const { user_id, username, name, gender } = payload;
  const selectUserQuery = `SELECT * FROM tweet WHERE tweet.user_id = ${user_id} AND tweet.tweet_id = ${tweetId};`;
  const tweetUser = await database.all(selectUserQuery);
  if (tweetUser.length !== 0) {
    const deleteTweetQuery = `
        DELETE FROM tweet
        WHERE
            tweet.user_id = ${user_id} AND tweet.tweet_id =${tweetId};`;
    await database.run(deleteTweetQuery);
    response.send("Tweet Removed");
  } else {
    response.status(401);
    response.send("Invalid Request");
  }
});

module.exports = app;
