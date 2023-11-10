const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const app = express();
const port = process.env.PORT;
// app.use(cors({
//   // origin:"http://localhost:3000"
//   origin:"https://roxilerdashboard.netlify.app/"
// }))

const allowedOrigins = ['https://roxilerdashboard.netlify.app/'];
app.use(cors({
  origin: function (origin, callback) {
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const productSchema = new mongoose.Schema({
  id: Number,
  title: String,
  price: Number,
  description: String,
  category: String,
  image: String,
  sold: Boolean,
  dateOfSale: Date,
});

const Product = mongoose.model('Product', productSchema);

app.get('/fetch-data', async (req, res) => {
  try {
    const fetchResponse = await fetch('https://s3.amazonaws.com/roxiler.com/product_transaction.json');
    if (!fetchResponse.ok) {
      throw new Error('Failed to fetch data');
    }

    const products = await fetchResponse.json();
    await Product.insertMany(products);

    res.json({ message: 'Successfully imported data' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error importing data' });
  }
});

app.get('/transactions', async (req, res) => {
  try {
    const { month, search = '', page = 1, perPage = 10 } = req.query;
    const searchQuery = {
      $or: [
        { title: { $regex: search, $options: 'i' } }, 
        { description: { $regex: search, $options: 'i' } },
        { price: { $eq: parseFloat(search) } }, 
      ],
    };
    const startOfMonth = new Date(`2000-${month}-01T00:00:00Z`);
    const endOfMonth = new Date(startOfMonth);
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);
    const dateQuery = {
      dateOfSale: { $gte: startOfMonth, $lt: endOfMonth },
    };
    const combinedQuery = { ...searchQuery, ...dateQuery };
    const transactions = await Product.find(combinedQuery)
      .skip((page - 1) * perPage)
      .limit(parseInt(perPage));
    res.json(transactions);
  } catch (error) {
    console.error('Error fetching transactions:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/statistics', async (req, res) => {
  try {
    const { month } = req.query;
    const startOfMonth = new Date(`2000-${month}-01T00:00:00Z`);
    const endOfMonth = new Date(startOfMonth);
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);
    const dateQuery = {
      dateOfSale: { $gte: startOfMonth, $lt: endOfMonth },
    };
    const totalSaleAmount = await Product.aggregate([
      { $match: dateQuery },
      { $group: { _id: null, totalAmount: { $sum: '$price' } } },
    ]);
    const totalSoldItems = await Product.countDocuments({ ...dateQuery, sold: true });
    const totalNotSoldItems = await Product.countDocuments({ ...dateQuery, sold: false });

    res.json({
      totalSaleAmount: totalSaleAmount[0] ? totalSaleAmount[0].totalAmount : 0,
      totalSoldItems,
      totalNotSoldItems,
    });
  } catch (error) {
    console.error('Error fetching statistics:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/barchart', async (req, res) => {
  try {
    const { month } = req.query;
    const startOfMonth = new Date(`2000-${month}-01T00:00:00Z`);
    const endOfMonth = new Date(startOfMonth);
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);

    const dateQuery = {
      dateOfSale: { $gte: startOfMonth, $lt: endOfMonth },
    };
    const result = await Product.aggregate([
      { $match: dateQuery },
      {
        $group: {
          _id: {
            $switch: {
              branches: [
                { case: { $lte: ['$price', 100] }, then: '0-100' },
                { case: { $lte: ['$price', 200] }, then: '101-200' },
                { case: { $lte: ['$price', 300] }, then: '201-300' },
                { case: { $lte: ['$price', 400] }, then: '301-400' },
                { case: { $lte: ['$price', 500] }, then: '401-500' },
                { case: { $lte: ['$price', 600] }, then: '501-600' },
                { case: { $lte: ['$price', 700] }, then: '601-700' },
                { case: { $lte: ['$price', 800] }, then: '701-800' },
                { case: { $lte: ['$price', 900] }, then: '801-900' },
                { case: { $gte: ['$price', 901] }, then: '901-above' },
              ],
              default: 'Other',
            },
          },
          count: { $sum: 1 },
        },
      },
    ]);

    res.json(result);
  } catch (error) {
    console.error('Error fetching bar chart data:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/combinedData', async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error fetching data' });
  }
});

app.get('/pie-chart', async (req, res) => {
  try {
    const { month } = req.query;
    const startOfMonth = new Date(`2000-${month}-01T00:00:00Z`);
    const endOfMonth = new Date(startOfMonth);
    endOfMonth.setMonth(endOfMonth.getMonth() + 1);

    const dateQuery = {
      dateOfSale: { $gte: startOfMonth, $lt: endOfMonth },
    };
    const pieChartData = await Product.aggregate([
      { $match: dateQuery },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
        },
      },
    ]);

    res.json(pieChartData);
  } catch (error) {
    console.error('Error fetching pie chart data:', error.message);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});