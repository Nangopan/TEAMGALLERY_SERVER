import { prisma } from './db';

async function main() {
    try {
        const adminName = "Test Admin";
        const adminEmail = `test_${Date.now()}@test.com`;
        
        await prisma.$transaction(async (tx) => {
            const newOrg = await tx.organisation.create({
                data: { name: "Test Org", address: "123 Test", phone: "123", logo_url: null }
            });
            console.log("Org Created:", newOrg.id);
            
            const newAdmin = await tx.user.create({
                data: {
                    name: adminName,
                    email: adminEmail,
                    password: "hashedPassword",
                    role: 'admin',
                    organization_id: newOrg.id,
                }
            });
            console.log("Admin Created:", newAdmin.id);
            
            await tx.organisation.update({
                where: { id: newOrg.id },
                data: { admin_id: newAdmin.id }
            });
            console.log("Org Updated with Admin ID. Success!");
        });
    } catch (err) {
        console.error("------- PRISMA ERROR REPORT -------");
        console.error(err);
        console.error("-----------------------------------");
    } finally {
        await prisma.$disconnect();
    }
}
main();
