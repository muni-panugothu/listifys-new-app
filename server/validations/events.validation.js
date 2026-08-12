/**
 * Events Validation Schemas
 */

const Joi = require('joi');
const {
  title, description, price, location, coordinates,
  images, phone, condition, features, mongoId, validate, geoQueryParams,
} = require('./common');

const EVENT_SUBCATEGORIES = [
  'Music', 'Food & Drink', 'Business', 'Health & Wellness',
  'Film', 'Comedy', 'Art', 'Sports', 'Theater',
  'Education', 'Community', 'Other',
];

const createEventSchema = Joi.object({
  title: title.required(),
  description: description.required(),
  price: price.optional(),
  category: Joi.string().valid('Events').default('Events'),
  subcategory: Joi.string().valid(...EVENT_SUBCATEGORIES).required().messages({
    'any.only': `Subcategory must be one of: ${EVENT_SUBCATEGORIES.join(', ')}`,
    'any.required': 'Subcategory is required',
  }),
  condition: condition.default('Good'),
  location: location.required(),
  coordinates: coordinates,
  images: images,
  features: features,
  phone: phone,

  // Event-specific
  eventDate: Joi.string().trim().max(300).allow(''),
  eventTime: Joi.string().trim().max(300).allow(''),
  organizer: Joi.string().trim().max(200).allow(''),
  venue: Joi.string().trim().max(300).allow(''),
  ticketsAvailable: Joi.number().integer().min(0).default(0),
  ageRestriction: Joi.string().trim().max(80).allow(''),
  dressCode: Joi.string().trim().max(120).allow(''),
  eventFormat: Joi.string().trim().max(80).allow(''),
  eventDuration: Joi.string().trim().max(40).allow(''),

  lat: Joi.number().min(-90).max(90).optional(),
  lng: Joi.number().min(-180).max(180).optional(),
  countryCode: Joi.string().trim().max(8).allow('').optional(),
  imageUrls: Joi.array().items(Joi.string().trim()).max(6).optional(),
});

const updateEventSchema = createEventSchema.fork(
  ['title', 'description', 'price', 'subcategory', 'location'],
  (field) => field.optional()
);

const queryEventSchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  sort: Joi.string().valid('createdAt', '-createdAt', 'price', '-price', 'eventDate').default('-createdAt'),
  search: Joi.string().trim().max(200).allow(''),
  subcategory: Joi.string().valid(...EVENT_SUBCATEGORIES).allow(''),
  minPrice: Joi.number().min(0),
  maxPrice: Joi.number().min(0),
  location: Joi.string().trim().max(200).allow(''),
  ...geoQueryParams,
}).unknown(true);

const paramsIdSchema = Joi.object({
  id: mongoId.required(),
});

module.exports = {
  createEventSchema,
  updateEventSchema,
  queryEventSchema,
  paramsIdSchema,

  validateCreateEvent: validate(createEventSchema),
  validateUpdateEvent: validate(updateEventSchema),
  validateEventQuery: validate(queryEventSchema, 'query'),
  validateEventParams: validate(paramsIdSchema, 'params'),

  EVENT_SUBCATEGORIES,
};
