interface User {
    id: string;
    name: string;
    email: string;
    role: string;
    createdAt: Date;
    updatedAt: Date;
}

interface UserWithPassword extends User {
    password: string;
}

interface UserCreate {
    name: string;
    email: string;
    password: string;
    role?: string;
}

interface UserUpdate {
    name?: string;
    email?: string;
    password?: string;
    role?: string;
}

interface UserRepository {
    create(data: UserCreate): Promise<User>;
    findAll(): Promise<User[]>;
    findById(id: string): Promise<User | null>;
    findByEmail(email: string): Promise<UserWithPassword | null>;
    update(id: string, data: UserUpdate): Promise<User>;
    delete(id: string): Promise<User>;
}

export type { User, UserWithPassword, UserCreate, UserUpdate, UserRepository };
