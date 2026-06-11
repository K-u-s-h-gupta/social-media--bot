const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.swarmCredential.update({
  where: { id: 'b2e5224d-9be3-490b-9e0a-ec4eaad5698d' },
  data: { sessionExpiry: new Date('2026-01-01'), sessionToken: null, sessionData: null }
}).then(() => {
  console.log('Updated successfully');
  return prisma.disconnect();
}).catch(err => {
  console.error('Error:', err.message);
  return prisma.disconnect();
});
