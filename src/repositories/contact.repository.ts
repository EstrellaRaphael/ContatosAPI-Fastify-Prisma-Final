import prisma from "../database/prisma-client.js";
import type {
    Contact,
    ContactCreate,
    ContactUpdate,
    ContactRepository,
} from "../interfaces/contact.interface.js";

class ContactRepositoryPrisma implements ContactRepository {
    async create(data: ContactCreate): Promise<Contact> {
        return prisma.contact.create({ data });
    }

    async findAll(): Promise<Contact[]> {
        return prisma.contact.findMany();
    }

    async findById(id: string): Promise<Contact | null> {
        return prisma.contact.findUnique({ where: { id } });
    }

    async findByUserId(userId: string): Promise<Contact[]> {
        return prisma.contact.findMany({ where: { userId } });
    }

    async update(id: string, data: ContactUpdate): Promise<Contact> {
        return prisma.contact.update({ where: { id }, data });
    }

    async delete(id: string): Promise<Contact> {
        return prisma.contact.delete({ where: { id } });
    }
}

export { ContactRepositoryPrisma };
