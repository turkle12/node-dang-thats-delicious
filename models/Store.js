const mongoose = require('mongoose');
mongoose.Promise = global.Promise;
const slug = require('slugs');

const storeSchema = new mongoose.Schema({
    name: {
        type: String,
        trim: true,
        required: 'Please enter a store name!'
    },
    slug: String,
    description: {
        type: String,
        trim: true
    },
    tags: [String],
    created: {
        type: Date,
        default: Date.now
    },
    location: {
        type: {
            type: String,
            default: 'Point'
        },
        coordinates: [{
            type: Number,
            required: 'You must supply coordinates!'
        }],
        address: {
            type: String,
            required: 'Please give an address'
        }
    },
    photo: String,
    author: {
        type: mongoose.Schema.ObjectId,
        ref: 'User',
        required: 'You must supply an author'
    }
});

// Define indexes
storeSchema.index({
    name: 'text',
    description: 'text'
});

storeSchema.index({
    location: '2dsphere'
});

storeSchema.pre('save', async function(next) {
    if (!this.isModified('name')) {
        next();
        return;
    };
    this.slug = slug(this.name);

    const slugRegEx = new RegExp(`^(${this.slug})((-[0-9]*$)?)$`, 
        'i');
    const storesWithSlug = await this.constructor.find({ slug: slugRegEx });
    if(storesWithSlug.length) {
        this.slug = `${this.slug}-${storesWithSlug.length + 1}`;
    }
    next();
    //TODO make slugs unique
});

storeSchema.statics.getTagsList = function() {
    return this.aggregate([
        { $unwind: '$tags' }, 
        { $group: { _id: '$tags', count: { $sum: 1 } }},
        { $sort: { count: -1 }}
    ]);
};

storeSchema.statics.getTopStores = function() {
    return this.aggregate([
        // Look up stores and populate their reviews
        { $lookup: {
            from: 'reviews', 
            localField: '_id', 
            foreignField: 'store',
            as: 'reviews'
        }},
        // filter for only items that have 2 or more reviews
        { $match: { 'reviews.1': { $exists: true } }},
        // Add the average reviews field
        { $project: {
            photo: '$$ROOT.photo',
            name: '$$ROOT.name',
            reviews: '$$ROOT.reviews',
            slug: '$$ROOT.slug',
            averageRating: { $avg: 'reviews.rating' }
        }},
        // sort it by our new field, highest field first
        { $sort: { averageRating: -1 } },
        // // limit to 10 at most
        { $limit: 10 }
    ]);
};

// Find reviews where the stores _id property === reviews store property.
storeSchema.virtual('reviews', {
    ref: 'Review', // What model to link? 
    localField: '_id', // Which field on store
    foreignField: 'store' // Which field on review
});

function autopopulate(next) {
    this.populate('reviews');
    next();
}

storeSchema.pre('find', autopopulate);
storeSchema.pre('findOne', autopopulate);

module.exports = mongoose.model('Store', storeSchema);