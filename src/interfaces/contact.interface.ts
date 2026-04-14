interface Contact {
    id: string;
    name: string;
    email: string | null;
    phone: string;
    createdAt: Date;
    updatedAt: Date;
    userId: string;
}

interface ContactCreate {
    name: string;
    phone: string;
    email?: string | null;
    userId: string;
}

interface ContactUpdate {
    name?: string;
    phone?: string;
    email?: string | null;
}

interface ContactRepository {
    create(data: ContactCreate): Promise<Contact>;
    findAll(): Promise<Contact[]>;
    findById(id: string): Promise<Contact | null>;
    findByUserId(userId: string): Promise<Contact[]>;
    update(id: string, data: ContactUpdate): Promise<Contact>;
    delete(id: string): Promise<Contact>;
}

export type { Contact, ContactCreate, ContactUpdate, ContactRepository };
