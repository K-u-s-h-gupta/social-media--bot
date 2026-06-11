import { Global, Module } from '@nestjs/common';
import { PrismaRepository, PrismaService, PrismaTransaction } from './prisma.service';
import { SwarmRepository } from '@gitroom/nestjs-libraries/database/prisma/swarm/swarm.repository';

@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [PrismaService, PrismaRepository, PrismaTransaction, SwarmRepository],
  get exports() {
    return this.providers;
  },
})
export class DatabaseModule {}
