import { pgEnum } from 'drizzle-orm/pg-core';

const providerTypeEnum = pgEnum('provider_type', ['email', 'google', 'line', 'facebook', 'github']);

export { providerTypeEnum };