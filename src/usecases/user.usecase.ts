import { AppError } from "../errors/app-error.js";
import type {
    User,
    UserCreate,
    UserUpdate,
    UserRepository,
} from "../interfaces/user.interface.js";

class UserUseCase {
    constructor(private readonly userRepository: UserRepository) {}

    async create(data: UserCreate): Promise<User> {
        const exists = await this.userRepository.findByEmail(data.email);
        if (exists) {
            throw new AppError("Email já está em uso", 409);
        }
        return this.userRepository.create(data);
    }

    async findAll(): Promise<User[]> {
        return this.userRepository.findAll();
    }

    async findById(id: string): Promise<User> {
        const user = await this.userRepository.findById(id);
        if (!user) {
            throw new AppError("Usuário não encontrado", 404);
        }
        return user;
    }

    async update(id: string, data: UserUpdate): Promise<User> {
        const exists = await this.userRepository.findById(id);
        if (!exists) {
            throw new AppError("Usuário não encontrado", 404);
        }
        return this.userRepository.update(id, data);
    }

    async delete(id: string): Promise<User> {
        const exists = await this.userRepository.findById(id);
        if (!exists) {
            throw new AppError("Usuário não encontrado", 404);
        }
        return this.userRepository.delete(id);
    }
}

export { UserUseCase };
