import {
  IConfirmCmsAudioUseCase,
  IConfirmCmsMediaUseCase,
  IListCmsMediaUseCase,
  IRequestCmsAudioUploadUseCase,
  IRequestCmsMediaUploadUseCase,
} from '@/application/contracts/media';
import {
  ApiTokenErrors,
  CurrentUser,
  IAuthPrincipal,
} from '@chantam/service.auth-lib';
import { ApiErrorResponses } from '@chantam/service.common-lib/decorators';
import { ResponseDto } from '@chantam/service.common-lib/dto';
import {
  ForbiddenException,
  ValidationFailedException,
} from '@chantam/service.common-lib/exception';
import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ConfirmCmsAudioBodyDto,
  ConfirmCmsAudioResponseDto,
  ConfirmCmsMediaBodyDto,
  ConfirmCmsMediaResponseDto,
  ListCmsMediaQueryDto,
  ListCmsMediaResponseDto,
  RequestCmsAudioUploadBodyDto,
  RequestCmsMediaUploadBodyDto,
  RequestCmsMediaUploadResponseDto,
} from '../../dto/admin-config/admin-media.dto';
import { RequiresPermission } from '../../guards';

const PermissionNote =
  'Cần MỘT trong `banner.manage`, `blog.manage`, `campaign.manage`, `dharma.manage`, `merit.manage` — ai soạn được nội dung có ảnh thì dùng được thư viện.';

@ApiTags('Admin - Thư viện ảnh')
@ApiBearerAuth()
@Controller('admin/media')
export class AdminMediaController {
  public constructor(
    @Inject(IRequestCmsMediaUploadUseCase)
    private readonly requestUploadUseCase: IRequestCmsMediaUploadUseCase,
    @Inject(IConfirmCmsMediaUseCase)
    private readonly confirmUseCase: IConfirmCmsMediaUseCase,
    @Inject(IListCmsMediaUseCase)
    private readonly listUseCase: IListCmsMediaUseCase,
    @Inject(IRequestCmsAudioUploadUseCase)
    private readonly requestAudioUseCase: IRequestCmsAudioUploadUseCase,
    @Inject(IConfirmCmsAudioUseCase)
    private readonly confirmAudioUseCase: IConfirmCmsAudioUseCase,
  ) {}

  @Post('audio/upload')
  @RequiresPermission('admin.access')
  @ApiOperation({
    summary: 'Xin URL tải âm thanh (Phật pháp)',
    description:
      'Như ảnh: (1) gọi đây lấy `uploadUrl` + `key`; (2) `PUT` tệp lên `uploadUrl` kèm đúng `Content-Type`; (3) `POST /admin/media/audio` với `key`, nhận `publicUrl` để đặt vào `audioUrl` của nội dung Phật pháp. mp3 / m4a / aac, tối đa 50 MB. Tệp không được nội dung nào dùng bị job dọn rác xoá sau 24 giờ. Cần `dharma.manage`.',
  })
  @ApiCreatedResponse({
    type: ResponseDto.forApi(RequestCmsMediaUploadResponseDto),
  })
  @ApiErrorResponses(...ApiTokenErrors, ForbiddenException, [
    ValidationFailedException,
    [
      'upload.contentType must be one of the following values: audio/mpeg, audio/mp4, audio/x-m4a, audio/aac',
    ],
  ])
  public async requestAudioUpload(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: RequestCmsAudioUploadBodyDto,
  ) {
    const upload = await this.requestAudioUseCase.handle({
      actorUserId: principal.userId,
      contentType: body.upload.contentType,
      contentLength: body.upload.contentLength,
    });
    return ResponseDto.create().succeed().attach({ upload }).build();
  }

  @Post('audio')
  @RequiresPermission('admin.access')
  @ApiOperation({
    summary: 'Xác nhận âm thanh đã tải',
    description:
      'Kiểm object thật (tồn tại, đúng loại âm thanh, ≤ 50 MB) dưới tiền tố của CHÍNH người gọi; sai thì xoá ngay. Cần `dharma.manage`.',
  })
  @ApiCreatedResponse({ type: ResponseDto.forApi(ConfirmCmsAudioResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, ForbiddenException, [
    ValidationFailedException,
    ['audio.key: Key âm thanh cms không thuộc chủ thể hiện tại.'],
  ])
  public async confirmAudio(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: ConfirmCmsAudioBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.confirmAudioUseCase.handle({
          actorUserId: principal.userId,
          key: body.audio.key,
        }),
      )
      .build();
  }

  @Post('upload')
  // Cổng chung vào CMS; use case đòi thêm một trong bốn quyền soạn nội dung.
  @RequiresPermission('admin.access')
  @ApiOperation({
    summary: 'Bước 1: xin URL tải ảnh lên thư viện',
    description:
      'Luồng ba bước: (1) gọi đây lấy `uploadUrl` + `key`; (2) `PUT` file lên `uploadUrl` kèm đúng `Content-Type`; (3) `POST /admin/media` với `key` để đưa ảnh vào thư viện.\
\
' +
      'Chỉ JPEG/PNG/WebP, tối đa 5 MB. URL hết hạn sau `expiresInSeconds`. Ảnh tải lên mà KHÔNG xác nhận bị job dọn rác xoá sau 24 giờ; ảnh đã vào thư viện thì không bao giờ bị dọn.\
\
' +
      PermissionNote,
  })
  @ApiCreatedResponse({
    type: ResponseDto.forApi(RequestCmsMediaUploadResponseDto),
  })
  @ApiErrorResponses(...ApiTokenErrors, ForbiddenException, [
    ValidationFailedException,
    [
      'upload.contentType must be one of the following values: image/jpeg, image/png, image/webp',
    ],
  ])
  public async requestUpload(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: RequestCmsMediaUploadBodyDto,
  ) {
    const upload = await this.requestUploadUseCase.handle({
      actorUserId: principal.userId,
      contentType: body.upload.contentType,
      contentLength: body.upload.contentLength,
    });

    return ResponseDto.create().succeed().attach({ upload }).build();
  }

  @Post()
  @RequiresPermission('admin.access')
  @ApiOperation({
    summary: 'Bước 3: xác nhận ảnh đã tải và đưa vào thư viện',
    description:
      'Kiểm object THẬT trên R2 (tồn tại, đúng loại, đúng cỡ) và kiểm `key` nằm dưới tiền tố của CHÍNH người gọi — key của người khác bị từ chối. Object sai loại hoặc quá cỡ bị xoá ngay.\
\
' +
      'Xác nhận lại cùng `key` trả lại đúng ảnh cũ, không sinh bản trùng. ' +
      PermissionNote,
  })
  @ApiCreatedResponse({ type: ResponseDto.forApi(ConfirmCmsMediaResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, ForbiddenException, [
    ValidationFailedException,
    ['media.key: Key ảnh thư viện cms không thuộc chủ thể hiện tại.'],
  ])
  public async confirm(
    @CurrentUser() principal: IAuthPrincipal,
    @Body() body: ConfirmCmsMediaBodyDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.confirmUseCase.handle({
          actorUserId: principal.userId,
          key: body.media.key,
          fileName: body.media.fileName,
        }),
      )
      .build();
  }

  @Get()
  @RequiresPermission('admin.access')
  @ApiOperation({
    summary: 'Thư viện ảnh dùng chung của CMS',
    description:
      'Mới tải trước. Ảnh của MỌI Admin, không chỉ của người gọi — thư viện là để dùng lại. ' +
      PermissionNote,
  })
  @ApiOkResponse({ type: ResponseDto.forApi(ListCmsMediaResponseDto) })
  @ApiErrorResponses(...ApiTokenErrors, ForbiddenException)
  public async list(
    @CurrentUser() principal: IAuthPrincipal,
    @Query() query: ListCmsMediaQueryDto,
  ) {
    return ResponseDto.create()
      .succeed()
      .attach(
        await this.listUseCase.handle({
          actorUserId: principal.userId,
          keyword: query.keyword,
          page: query.page,
          pageSize: query.pageSize,
        }),
      )
      .build();
  }
}
