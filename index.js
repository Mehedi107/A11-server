import 'dotenv/config';
import express, { json } from 'express';
import cors from 'cors';
import { MongoClient, ObjectId, ServerApiVersion } from 'mongodb';
import jwt, { decode } from 'jsonwebtoken';
import cookieParser from 'cookie-parser';

const app = express();
const port = process.env.PORT || 3000;

// Middleware
const corsOptions = {
  origin: [
    'http://localhost:5173',
    'https://artifact-vault-916d6.web.app',
    'https://artifact-vault-916d6.firebaseapp.com',
  ],
  credentials: true,
};

app.use(cors(corsOptions));
app.use(json());
app.use(cookieParser());

// Mongodb configuration
const uri = `mongodb+srv://${process.env.USER_NAME}:${process.env.PASSWORD}@cluster0.blfnk.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) return res.status(401).send({ message: 'Unauthorize access' });

  jwt.verify(token, process.env.JWT_SECRET_KEY, (err, decoded) => {
    if (err) return res.status(401).send({ message: 'Unauthorize access' });

    req.user = decoded;
  });

  next();
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db('admin').command({ ping: 1 });
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    );

    const artifactDB = client.db('artifact-vault');
    const artifactsColl = artifactDB.collection('artifacts');

    // Generate JWT Token
    app.post('/jwt', async (req, res) => {
      const userEmail = req.body;
      const token = jwt.sign(userEmail, process.env.JWT_SECRET_KEY, {
        expiresIn: '365d',
      });
      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true });
    });

    // Remove JWT token from cookie
    app.get('/logout', async (req, res) => {
      res
        .clearCookie('token', {
          maxAge: 0,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true });
    });

    // Get 6 most liked artifacts data form DB
    app.get('/artifacts', async (req, res) => {
      try {
        const cursor = artifactsColl.find().sort({ likeCount: -1 }).limit(6); // Limit to 6 documents
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        console.error('Error fetching artifacts:', error);
        res.status(500).send({ message: 'Internal server error' });
      }
    });

    // Get all artifacts data form DB
    // app.get('/all-artifacts', async (req, res) => {
    //   try {
    //     const cursor = artifactsColl.find();
    //     const result = await cursor.toArray();
    //     res.send(result);
    //   } catch (error) {
    //     console.error('Error fetching artifacts:', error);
    //     res.status(500).send({ message: 'Internal server error' });
    //   }
    // });

    // Get single artifact data by ID form DB
    app.get('/artifacts/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await artifactsColl.findOne(query);
        res.send(result);
      } catch (error) {
        console.error('Fetching artifact data by id', error);
        res.status(500).send({ message: 'Internal server error' });
      }
    });

    // Save artifact data to DB
    app.post('/artifacts', async (req, res) => {
      try {
        const artifactData = req.body;
        const result = await artifactsColl.insertOne(artifactData);
        res.send(result);
      } catch (error) {
        res.send(error);
      }
    });

    // Get artifacts by search character
    app.get('/searched-artifacts', async (req, res) => {
      const search = req.query.search;
      const query = {
        name: {
          $regex: search,
          $options: 'i',
        },
      };
      const result = await artifactsColl.find(query).toArray();
      res.send(result);
    });

    // Update like count in DB
    app.patch('/artifacts/:id/like', async (req, res) => {
      try {
        const { id } = req.params;
        const userEmail = req.body.email;
        const filter = { _id: new ObjectId(id) };

        // Check if the user already liked the artifact
        const artifact = await artifactsColl.findOne(filter);

        const alreadyLiked = artifact.likedBy?.includes(userEmail);

        // Toggle logic
        const update = alreadyLiked
          ? {
              $pull: { likedBy: userEmail }, // Remove the user from the likedBy array
              $inc: { likeCount: -1 }, // Decrease the like count
            }
          : {
              $addToSet: { likedBy: userEmail }, // Add the user to the likedBy array
              $inc: { likeCount: 1 }, // Increase the like count
            };

        const options = { returnDocument: 'after' };

        const result = await artifactsColl.findOneAndUpdate(
          filter,
          update,
          options // Return the updated document
        );
        res.send(result);
      } catch (error) {
        // console.error('Error updating like count:', error);
        res.status(500).send({ error: 'Server error' });
      }
    });

    // Get artifacts liked by user liked
    app.get('/liked-artifact/:email', verifyToken, async (req, res) => {
      try {
        const decodedEmail = req?.user?.email;
        const email = req.params.email;

        if (decodedEmail !== email) {
          return res.status(401).send({ message: 'Unauthorize access' });
        }

        const artifacts = await artifactsColl
          .find({ likedBy: email })
          .toArray();

        // console.log(artifacts);

        res.status(200).send(artifacts);
      } catch (error) {
        // console.error('Error fetching liked artifacts:', error);
        res.status(500).send({ error: 'Server error' });
      }
    });

    // fetch user artifact data by email from DB
    app.get('/my-artifact/:email', verifyToken, async (req, res) => {
      const userEmail = req.params.email;
      const decodedEmail = req?.user?.email;

      if (decodedEmail !== email) {
        return res.status(401).send({ message: 'Unauthorize access' });
      }

      const filter = { addedByEmail: userEmail };
      const cursor = artifactsColl.find(filter);
      const result = await cursor.toArray();
      res.send(result);
    });

    // Update user added artifact data in the DB
    app.put('/artifacts', async (req, res) => {
      const data = req.body;
      const filter = { _id: new ObjectId(data.artifactId) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          name: data.name,
          image: data.image,
          type: data.type,
          context: data.context,
          createdAt: data.createdAt,
          discoveredAt: data.discoveredAt,
          discoveredBy: data.discoveredBy,
          presentLocation: data.presentLocation,
        },
      };

      const result = await artifactsColl.updateOne(filter, updateDoc, options);
      res.send(result);
    });

    // Delete artifact form DB
    app.delete('/artifacts/:id', async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = { _id: new ObjectId(id) };
      const result = await artifactsColl.deleteOne(query);
      res.send(result);
    });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
