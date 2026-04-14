import bcrypt from "bcryptjs";
import prisma from "../database/prisma-client.js";
import type {
    User,
    UserCreate,
    UserUpdate,
    UserRepository,
    UserWithPassword,
} from "../interfaces/user.interface.js";

const userSelect = {
    id: true,
    name: true,
    email: true,
    role: true,
    createdAt: true,
    updatedAt: true,
} as const;

class UserRepositoryPrisma implements UserRepository {
    async create(data: UserCreate): Promise<User> {
        const passwordHash = await bcrypt.hash(data.password, 10);
        return prisma.user.create({
            data: {
                name: data.name,
                email: data.email,
                password: passwordHash,
                role: data.role ?? "user",
            },
            select: userSelect,
        });
    }

    async findAll(): Promise<User[]> {
        return prisma.user.findMany({ select: userSelect });
    }

    async findById(id: string): Promise<User | null> {
        return prisma.user.findUnique({ where: { id }, select: userSelect });
    }

    async findByEmail(email: string): Promise<UserWithPassword | null> {
        return prisma.user.findUnique({ where: { email } });
    }

    async update(id: string, data: UserUpdate): Promise<User> {
        const updateData: {
            name?: string;
            email?: string;
            password?: string;
            role?: string;
        } = {};

        if (data.name !== undefined) updateData.name = data.name;
        if (data.email !== undefined) updateData.email = data.email;
        if (data.role !== undefined) updateData.role = data.role;
        if (data.password !== undefined) {
            updateData.password = await bcrypt.hash(data.password, 10);
        }

        return prisma.user.update({ where: { id }, data: updateData, select: userSelect });
    }

    async delete(id: string): Promise<User> {
        return prisma.user.delete({ where: { id }, select: userSelect });
    }
}

export { UserRepositoryPrisma };
