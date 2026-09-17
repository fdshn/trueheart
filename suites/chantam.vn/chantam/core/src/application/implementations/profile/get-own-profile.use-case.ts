import {
  IGetOwnProfileCommand,
  IGetOwnProfileUseCase,
} from '@/application/contracts/profile';
import { UserNotFoundException } from '@/domain/exceptions';
import { IUserRepository } from '@/domain/ports/repository';
import { Inject, Injectable } from '@nestjs/common';
import { toOwnProfileDto } from './profile.mapper';

@Injectable()
export class GetOwnProfileUseCase implements IGetOwnProfileUseCase {
  public constructor(
    @Inject(IUserRepository)
    private readonly userRepository: IUserRepository,
  ) {}

  public async handle(command: IGetOwnProfileCommand) {
    const user = await this.userRepository.findOneBy({
      globalId: command.userId,
    });

    if (!user || user.deletedAt) throw new UserNotFoundException();

    return { profile: toOwnProfileDto(user) };
  }
}
