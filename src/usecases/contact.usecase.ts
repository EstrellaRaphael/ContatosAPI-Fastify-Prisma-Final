import { AppError } from "../errors/app-error.js";
import type {
    Contact,
    ContactCreate,
    ContactUpdate,
    ContactRepository,
} from "../interfaces/contact.interface.js";

class ContactUseCase {
    constructor(private readonly contactRepository: ContactRepository) {}

    async create(userId: string, data: Omit<ContactCreate, "userId">): Promise<Contact> {
        return this.contactRepository.create({ ...data, userId });
    }

    async findByUserId(userId: string): Promise<Contact[]> {
        return this.contactRepository.findByUserId(userId);
    }

    async update(id: string, userId: string, data: ContactUpdate): Promise<Contact> {
        const contact = await this.contactRepository.findById(id);
        if (!contact) {
            throw new AppError("Contato não encontrado", 404);
        }
        if (contact.userId !== userId) {
            throw new AppError("Acesso negado", 403);
        }
        return this.contactRepository.update(id, data);
    }

    async delete(id: string, userId: string): Promise<Contact> {
        const contact = await this.contactRepository.findById(id);
        if (!contact) {
            throw new AppError("Contato não encontrado", 404);
        }
        if (contact.userId !== userId) {
            throw new AppError("Acesso negado", 403);
        }
        return this.contactRepository.delete(id);
    }
}

export { ContactUseCase };
