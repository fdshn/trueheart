import { NotificationTemplateNotFoundException } from '@/domain/exceptions';
import {
  IAdminConfigRepository,
  INotificationTemplateRepository,
} from '@/domain/ports/repository';
import { NotificationTypes } from '@chantam.vn/chantam.core-lib/consts';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import {
  ListNotificationTemplatesUseCase,
  UpdateNotificationTemplateUseCase,
} from './notification-template.use-cases';

const ActorId = '11111111-1111-4111-8111-111111111111';

const template = (overrides = {}) => ({
  type: NotificationTypes.NEW_CHAT_MESSAGE,
  title: 'Bạn có tin nhắn mới',
  body: '{preview}',
  isEnabled: false,
  updatedBy: null,
  updatedAt: new Date(),
  ...overrides,
});

function makeDeps(allowed = true, updated: unknown = template()) {
  return {
    templates: {
      listAll: jest.fn().mockResolvedValue([template()]),
      findEnabled: jest.fn(),
      update: jest.fn().mockResolvedValue(updated),
    } as unknown as jest.Mocked<INotificationTemplateRepository>,
    admin: {
      hasPermission: jest.fn().mockResolvedValue(allowed),
    } as unknown as jest.Mocked<IAdminConfigRepository>,
  };
}

describe('ListNotificationTemplatesUseCase', () => {
  it('trả cả mẫu đang TẮT — Admin cần thấy mới bật được', async () => {
    const deps = makeDeps();

    const result = await new ListNotificationTemplatesUseCase(
      deps.templates,
      deps.admin,
    ).handle({ actorUserId: ActorId });

    expect(deps.admin.hasPermission).toHaveBeenCalledWith(
      ActorId,
      'notification.manage',
    );
    expect(result.templates).toHaveLength(1);
    expect(result.templates[0].isEnabled).toBe(false);
  });

  it('gộp chỗ trống của cả tiêu đề lẫn nội dung, không trùng', async () => {
    const deps = makeDeps();
    deps.templates.listAll.mockResolvedValue([
      template({ title: 'Chào {ten}', body: '{ten} có {so} tin' }),
    ]);

    const result = await new ListNotificationTemplatesUseCase(
      deps.templates,
      deps.admin,
    ).handle({ actorUserId: ActorId });

    expect(result.templates[0].placeholders).toEqual(['ten', 'so']);
  });

  it('thiếu quyền thì chặn trước khi đọc', async () => {
    const deps = makeDeps(false);

    await expect(
      new ListNotificationTemplatesUseCase(deps.templates, deps.admin).handle({
        actorUserId: ActorId,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(deps.templates.listAll).not.toHaveBeenCalled();
  });
});

describe('UpdateNotificationTemplateUseCase', () => {
  const body = {
    template: {
      title: 'Tiêu đề mới',
      body: 'Nội dung {preview}',
      isEnabled: true,
    },
  };

  it('sửa được và ghi lại ai sửa', async () => {
    const deps = makeDeps(true, template({ title: 'Tiêu đề mới' }));

    await new UpdateNotificationTemplateUseCase(
      deps.templates,
      deps.admin,
    ).handle({
      actorUserId: ActorId,
      type: NotificationTypes.NEW_CHAT_MESSAGE,
      ...body,
    });

    expect(deps.templates.update).toHaveBeenCalledWith({
      type: NotificationTypes.NEW_CHAT_MESSAGE,
      title: 'Tiêu đề mới',
      body: 'Nội dung {preview}',
      isEnabled: true,
      updatedBy: ActorId,
    });
  });

  it('cắt khoảng trắng thừa', async () => {
    const deps = makeDeps();

    await new UpdateNotificationTemplateUseCase(
      deps.templates,
      deps.admin,
    ).handle({
      actorUserId: ActorId,
      type: NotificationTypes.NEW_CHAT_MESSAGE,
      template: { title: '  A  ', body: '  B  ', isEnabled: false },
    });

    expect(deps.templates.update).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'A', body: 'B' }),
    );
  });

  it('tiêu đề hoặc nội dung rỗng bị từ chối', async () => {
    const deps = makeDeps();

    await expect(
      new UpdateNotificationTemplateUseCase(deps.templates, deps.admin).handle({
        actorUserId: ActorId,
        type: NotificationTypes.NEW_CHAT_MESSAGE,
        template: { title: '   ', body: 'B', isEnabled: true },
      }),
    ).rejects.toBeInstanceOf(ValidationFailedException);
    expect(deps.templates.update).not.toHaveBeenCalled();
  });

  it('loại không có mẫu thì báo không tìm thấy', async () => {
    const deps = makeDeps(true, null);

    await expect(
      new UpdateNotificationTemplateUseCase(deps.templates, deps.admin).handle({
        actorUserId: ActorId,
        type: NotificationTypes.NEW_CHAT_MESSAGE,
        ...body,
      }),
    ).rejects.toBeInstanceOf(NotificationTemplateNotFoundException);
  });

  it('thiếu quyền thì chặn trước khi ghi', async () => {
    const deps = makeDeps(false);

    await expect(
      new UpdateNotificationTemplateUseCase(deps.templates, deps.admin).handle({
        actorUserId: ActorId,
        type: NotificationTypes.NEW_CHAT_MESSAGE,
        ...body,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(deps.templates.update).not.toHaveBeenCalled();
  });
});
