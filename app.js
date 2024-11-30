require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');
const path = require('path');

const app = express();

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log("Connected to MongoDB"))
    .catch(err => console.error("MongoDB connection failed:", err));

// Schemas and Models
const teacherSchema = mongoose.Schema({
    email: { type: String, required: true },
    password: { type: String, required: true }
});
const studentSchema = mongoose.Schema({
    sname: { type: String, required: true },
    roll: { type: String, required: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true } // Link to teacher
});
const attendanceSchema = mongoose.Schema({
    date: { type: String, required: true },
    records: [
        {
            roll: String,
            present: Boolean
        }
    ],
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true } // Link to teacher
});

const Teacher = mongoose.model('Teacher', teacherSchema);
const Student = mongoose.model('Student', studentSchema);
const Attendance = mongoose.model('Attendance', attendanceSchema);

// Middleware
app.set('view engine', 'ejs');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Authentication Middleware
const auth = (req, res, next) => {
    const token = req.cookies.authToken;
    if (!token) return res.redirect('/login');
    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        req.user = verified; // Attach user info to request
        next();
    } catch (err) {
        console.error(err);
        res.redirect('/login');
    }
};

// Routes
app.get('/', (req, res) => {
    res.render('home');
});

app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

app.get('/logout', (req, res) => {
    res.clearCookie('authToken');
    res.redirect('/login');
});

app.get('/register', (req, res) => {
    res.render('register');
});

app.get('/dashboard', auth, (req, res) => {
    res.render('dashboard');
});

app.get('/add', auth, (req, res) => {
    res.render('add');
});

app.post('/register', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).send("Email and password are required");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await new Teacher({ email, password: passwordHash }).save();
    res.redirect('/login');
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    const user = await Teacher.findOne({ email });
    if (!user || !await bcrypt.compare(password, user.password)) {
        return res.render('login', { error: 'Email or Password is incorrect' });
    }

    const token = jwt.sign({ _id: user._id, email: email }, process.env.JWT_SECRET, { expiresIn: '1h' }); // Include _id
    res.cookie('authToken', token);
    res.redirect('/dashboard');
});

app.post('/add', auth, async (req, res) => {
    const { sname, roll } = req.body;
    if (!sname || !roll) {
        return res.status(400).send("Student name and roll number are required");
    }

    await new Student({ sname, roll, teacherId: req.user._id }).save(); // Add teacherId
    res.redirect('/add');
});

app.delete('/delete-student/:id', auth, async (req, res) => {
    try {
        const studentId = req.params.id;
        const deletedStudent = await Student.findOneAndDelete({ _id: studentId, teacherId: req.user._id });
        if (!deletedStudent) {
            return res.status(404).json({ message: 'Student not found' });
        }
        res.status(200).json({ message: 'Student deleted successfully' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Failed to delete student' });
    }
});

app.get('/totel', auth, async (req, res) => {
    const students = await Student.find({ teacherId: req.user._id }); // Filter by teacherId
    res.render('totel', { data: students });
});

app.get('/attendence', auth, async (req, res) => {
    const students = await Student.find({ teacherId: req.user._id }); // Filter by teacherId
    res.render('attendence', { data: students });
});

app.post('/attendence', auth, async (req, res) => {
    try {
        const { date, attendance } = req.body;

        if (!date) return res.status(400).send('Date is required');
        const attendanceArray = Array.isArray(attendance)
            ? attendance
            : attendance ? [attendance] : [];

        const records = attendanceArray.map(roll => ({ roll, present: true }));
        await new Attendance({ date, records, teacherId: req.user._id }).save(); // Add teacherId

        res.redirect('/dashboard');
    } catch (err) {
        console.error(err);
        res.status(500).send('An error occurred');
    }
});

app.get('/view-attendance', auth, async (req, res) => {
    const filterDate = req.query.date;
    const attendanceRecords = filterDate
        ? await Attendance.find({ date: filterDate, teacherId: req.user._id }) // Filter by teacherId
        : await Attendance.find({ teacherId: req.user._id });
    res.render('viewAttendance', { attendanceRecords, filterDate });
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
