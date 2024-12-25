import 'dotenv/config';
import express, { json } from 'express';
import cors from 'cors';
import { MongoClient, ObjectId, ServerApiVersion } from 'mongodb';

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(json());

const uri = `mongodb+srv://${process.env.USER_NAME}:${process.env.PASSWORD}@cluster0.blfnk.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 });
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    );

    const artifactDB = client.db('artifact-vault');
    const artifactsColl = artifactDB.collection('artifacts');

    // Get 6 most liked artifacts data form DB
    app.get('/artifacts', async (req, res) => {
      try {
        const cursor = artifactsColl.find().limit(6); // Limit to 6 documents
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        console.error('Error fetching artifacts:', error);
        res.status(500).send({ message: 'Internal server error' });
      }
    });

    // Get all artifacts data form DB
    app.get('/all-artifacts', async (req, res) => {
      try {
        const cursor = artifactsColl.find();
        const result = await cursor.toArray();
        res.send(result);
      } catch (error) {
        console.error('Error fetching artifacts:', error);
        res.status(500).send({ message: 'Internal server error' });
      }
    });

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
