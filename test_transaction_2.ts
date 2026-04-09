import { prisma } from './db';
import fs from 'fs';

async function main() {
    try {
        await prisma.$transaction(async (tx) => {
            const newOrg = await tx.organisation.create({
                data: { name: "Test Org", address: "123 Test", phone: "123", logo_url: null }
            });
            console.log("Success");
        });
    } catch (err: any) {
        fs.writeFileSync('error_output.txt', err.message || JSON.stringify(err));
    } finally {
        await prisma.$disconnect();
    }
}
main();
